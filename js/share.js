// "Share link": the guide's text (no photos) packed into a URL hash,
// #view=<data>, so any phone can open it on the live site with a working
// map and nothing ever reaches a server. Data is short-keyed JSON,
// deflate-raw compressed, base64url encoded.
import { mapsSearchUrl, SITE_URL, safeUrl } from './state.js';

const VERSION = 1;
const MAX_DISHES = 300;
const MAX_JSON_BYTES = 1_000_000; // decompression cap

export const canShareLinks = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

// What rank.js generates for a picked place; links leave it out and rebuild it.
const defaultMapsUrl = (name, address) => mapsSearchUrl(`${name} ${address}`.trim());
const round5 = (n) => Math.round(n * 1e5) / 1e5;

function toBase64Url(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function deflate(text) {
  const stream = new Blob([text]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_JSON_BYTES) { reader.cancel(); throw new Error('Guide data too large'); }
    chunks.push(value);
  }
  return new TextDecoder().decode(await new Blob(chunks).arrayBuffer());
}

export async function encodeGuide(trip) {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const payload = {
    v: VERSION,
    n: trip.name || undefined,
    a: trip.author || undefined,
    d: `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
    x: (trip.dishes || []).map((d) => {
      const p = d.place || {};
      const e = { t: d.title || undefined, o: d.note || undefined };
      if (p.name) {
        e.p = p.name;
        if (p.address) e.r = p.address;
        if (Number.isFinite(p.lat) && Number.isFinite(p.lon)) { e.y = round5(p.lat); e.z = round5(p.lon); }
        if (p.mapsUrl && p.mapsUrl !== defaultMapsUrl(p.name, p.address || '')) e.m = p.mapsUrl;
        if (p.website) e.w = p.website;
      }
      return e;
    }),
  };
  return toBase64Url(await deflate(JSON.stringify(payload)));
}

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');
const coord = (v, lim) => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= lim ? v : undefined);

// Returns a trip-shaped object for guideHtml/mountMap, or throws if the
// data is missing or corrupt. Everything is type-checked and clipped; text
// is escaped later by guideHtml and links only survive if http(s).
export async function decodeGuide(data) {
  if (!data || !/^[A-Za-z0-9_-]+$/.test(data)) throw new Error('Missing guide data');
  const json = JSON.parse(await inflate(fromBase64Url(data)));
  if (!json || json.v !== VERSION || !Array.isArray(json.x) || json.x.length > MAX_DISHES) throw new Error('Unrecognised guide data');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(json.d) ? json.d : '';
  const dishes = json.x.map((e) => {
    e = e && typeof e === 'object' ? e : {};
    const name = str(e.p, 120);
    let place = null;
    if (name) {
      const address = str(e.r, 200);
      const lat = coord(e.y, 90);
      const lon = coord(e.z, 180);
      place = {
        name,
        address,
        mapsUrl: safeUrl(str(e.m, 2000)) || defaultMapsUrl(name, address),
        website: safeUrl(str(e.w, 2000)),
        ...(lat !== undefined && lon !== undefined && { lat, lon }),
      };
    }
    return { title: str(e.t, 200), note: str(e.o, 400), image: '', place };
  });
  return { name: str(json.n, 120), author: str(json.a, 80), date, dishes };
}

// Links point at the site the app is served from; local copies fall back
// to the live site so a shared link never only works on one machine.
export async function shareUrl(trip) {
  const local = !/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const base = local ? SITE_URL : location.origin + location.pathname;
  return `${base}#view=${await encodeGuide(trip)}`;
}
