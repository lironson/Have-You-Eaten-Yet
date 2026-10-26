// "Where to eat" map on the summary: Leaflet + OpenStreetMap tiles, one
// numbered pin per tagged restaurant. Places without coordinates (typed
// names, older trips) are looked up once and saved.
import { updateTrip, escapeHtml } from './state.js';
import { loadScript, loadStyle } from './load.js';

// Swap for another tile provider if traffic grows (OSM's tiles are for light use).
const TILES = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};
const GEOCODE = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=';
const GEOCODE_GAP = 1100; // Nominatim allows ~1 request per second
const PRINT_WIDTH = 700; // px that fit the printable width of both Letter and A4

const hasCoords = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// `live`: the summary screen, where missing pins may still be looked up.
// The downloaded page only gets a map if it has pins to show.
export function mapSectionHtml(trip, live = true) {
  const tagged = trip.dishes.some((d) => d.place && d.place.name);
  if (!tagged || (!live && !trip.dishes.some((d) => hasCoords(d.place)))) return '';
  const note = missingNote(trip);
  return `<section class="mp" aria-labelledby="mp-h">
    <h2 class="sm-section-title" id="mp-h"><span>Where to eat</span></h2>
    <div class="mp-map" role="region" aria-label="Map of the restaurants"></div>
    <p class="mp-missing muted"${note ? '' : ' hidden'}>${escapeHtml(note)}</p>
  </section>`;
}

// Plain pin data; also embedded as JSON in the downloaded page.
export function pinData(trip, urlFor, withImages = false) {
  const pins = [];
  trip.dishes.forEach((d, i) => {
    if (!hasCoords(d.place)) return;
    pins.push({
      rank: i + 1,
      title: (d.title || '').trim() || 'Untitled dish',
      place: d.place.name || '',
      lat: d.place.lat,
      lon: d.place.lon,
      url: urlFor(d),
      ...(withImages && d.image && { image: d.image }),
    });
  });
  return pins;
}

export function missingNote(trip) {
  const names = trip.dishes.filter((d) => d.place && d.place.geo === 'none').map((d) => d.place.name);
  return names.length ? `Not on map: ${names.join(', ')} (no location found)` : '';
}

// Self-contained (no imports or outer variables) so its source can be
// inlined into the downloaded page as-is.
export function drawMap(L, el, pins, tiles) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.5 });
  L.tileLayer(tiles.url, { attribution: tiles.attribution, maxZoom: 19 }).addTo(map);
  // Scroll-zoom only after the map is clicked, so page scrolling isn't hijacked.
  map.on('click', () => map.scrollWheelZoom.enable());
  map.on('mouseout', () => map.scrollWheelZoom.disable());
  const layer = L.featureGroup().addTo(map);

  function fit() {
    if (layer.getLayers().length) map.fitBounds(layer.getBounds(), { padding: [36, 36], maxZoom: 16 });
    else map.setView([20, 0], 1);
  }
  function set(list) {
    layer.clearLayers();
    list.forEach((p) => {
      const medal = p.rank <= 3 ? ` mp-pin--${p.rank}` : '';
      const icon = L.divIcon({
        className: 'mp-pin-wrap',
        html: `<span class="mp-pin${medal}">${p.rank}</span>`,
        iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -16],
      });
      const safe = /^https?:\/\//i.test(p.url || '') ? p.url : '';
      const popup = `<div class="mp-pop">${p.image ? `<img src="${esc(p.image)}" alt="">` : ''}
        <strong>#${p.rank} ${esc(p.title)}</strong>
        ${p.place ? `<span>${esc(p.place)}</span>` : ''}
        ${safe ? `<a href="${esc(safe)}" target="_blank" rel="noopener">Google Maps ↗</a>` : ''}</div>`;
      L.marker([p.lat, p.lon], { icon, title: `#${p.rank} ${p.title}`, zIndexOffset: 1000 - p.rank })
        .bindPopup(popup, { minWidth: 160, maxWidth: 220 })
        .addTo(layer);
    });
    fit();
  }
  set(pins);
  return { map, set, fit };
}

export const LEAFLET_JS = 'vendor/leaflet/leaflet.js';
export const LEAFLET_CSS = 'vendor/leaflet/leaflet.css';
export { TILES };

// Live map on the summary screen. Returns a cleanup function.
export function mountMap(container, trip, urlFor) {
  const section = container.querySelector('.mp');
  if (!section) return () => {};
  const el = section.querySelector('.mp-map');
  const missingEl = section.querySelector('.mp-missing');
  let alive = true;
  let ctl = null;

  const refresh = () => {
    if (ctl) ctl.set(pinData(trip, urlFor, true));
    const note = missingNote(trip);
    missingEl.textContent = note;
    missingEl.hidden = !note;
  };
  // Print keeps the map at its exact on-screen pixel size and scales it to
  // the paper with CSS zoom. Re-laying it out at print width would need new
  // tiles, which don't load in time and leave grey gaps in the PDF.
  const printMedia = matchMedia('print');
  const measure = () => {
    if (printMedia.matches) return;
    const { width, height } = el.getBoundingClientRect();
    if (!width) return;
    el.style.setProperty('--mp-w', `${width}px`);
    el.style.setProperty('--mp-h', `${height}px`);
    el.style.setProperty('--mp-zoom', Math.min(1, PRINT_WIDTH / width).toFixed(4));
  };

  loadStyle(LEAFLET_CSS);
  loadScript(LEAFLET_JS).then(() => {
    if (!alive) return;
    ctl = drawMap(window.L, el, pinData(trip, urlFor, true), TILES);
    measure();
    refresh();
    geocodeMissing();
  }).catch(() => {
    el.innerHTML = '<p class="mp-fallback muted">The map couldn\'t load. Check your connection.</p>';
  });
  window.addEventListener('resize', measure);

  async function lookup(q) {
    const res = await fetch(GEOCODE + encodeURIComponent(q), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const [hit] = await res.json();
    const lat = Number(hit && hit.lat);
    const lon = Number(hit && hit.lon);
    return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
  }

  async function geocodeMissing() {
    const todo = trip.dishes.filter((d) => d.place && d.place.name && !hasCoords(d.place) && d.place.geo !== 'none');
    const city = (trip.name || '').split(',')[0].trim();
    for (const d of todo) {
      const p = d.place;
      // Most specific first; the trip name often holds the city ("Tokyo, Spring 2026").
      const queries = p.address ? [`${p.name}, ${p.address}`] : [`${p.name} ${trip.name || ''}`.trim(), city && `${p.name} ${city}`];
      let found = null;
      try {
        for (const q of [...new Set(queries.filter(Boolean))]) {
          if (!alive) return;
          found = await lookup(q);
          await sleep(GEOCODE_GAP);
          if (found) break;
        }
      } catch {
        return; // offline or rate-limited: try again next visit
      }
      if (!alive) return;
      if (found) Object.assign(p, found);
      else p.geo = 'none';
      updateTrip((t) => t);
      refresh();
    }
  }

  return () => {
    alive = false;
    window.removeEventListener('resize', measure);
    if (ctl) ctl.map.remove();
  };
}

// Script tags that make the downloaded page's map interactive (tiles load online).
export async function standaloneMapScript(trip, urlFor) {
  const pins = pinData(trip, urlFor);
  if (!pins.length) return '';
  const leaflet = await (await fetch(LEAFLET_JS)).text();
  const json = (v) => JSON.stringify(v).replace(/</g, '\\u003c');
  return `<script>${leaflet.replace(/<\/script/gi, '<\\/script')}</script>
<script>(${drawMap.toString()})(L, document.querySelector('.mp-map'), ${json(pins)}, ${json(TILES)});</script>`;
}

