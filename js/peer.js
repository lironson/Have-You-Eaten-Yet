// Shared bits for "invite friends": phones connect directly over WebRTC via
// PeerJS. PeerJS's free public broker only introduces the two phones; photos
// travel straight between them and are never stored on a server.

export const MAX_IMAGE_CHARS = 4_000_000; // a 1600px JPEG data URL is well under this
export const MAX_PER_GUEST = 100;

const scripts = new Map();

// Libraries are vendored and only loaded when someone actually uses invites.
function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => { scripts.delete(src); reject(new Error(`Could not load ${src}`)); };
      document.head.appendChild(el);
    }));
  }
  return scripts.get(src);
}

export const loadPeer = () => loadScript('vendor/peerjs.min.js').then(() => window.Peer);
export const loadQr = () => loadScript('vendor/qrcode.js').then(() => window.qrcode);

export function newRoomId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  return 'hyey-' + [...bytes].map((b) => b.toString(36).padStart(2, '0')).join('');
}

export function joinUrl(id) {
  return `${location.origin}${location.pathname}${location.search}#join=${id}`;
}

// `?peerserver=host:port` points at a self-hosted PeerServer instead of the
// public broker (handy for local testing). Otherwise PeerJS defaults apply,
// which include public STUN/TURN servers.
export function peerOptions() {
  const custom = new URLSearchParams(location.search).get('peerserver');
  if (!custom) return {};
  const [host, port] = custom.split(':');
  const secure = location.protocol === 'https:';
  return { host, port: Number(port) || (secure ? 443 : 80), path: '/', secure };
}
