// Guest screen (#join=<id>), opened by scanning a host's QR code. Photos are
// downscaled on this phone and sent one at a time straight to the host.
import { newId, escapeHtml } from './state.js';
import { looksLikeImage, downscale } from './images.js';
import { loadPeer, peerOptions } from './peer.js';

const CONNECT_TIMEOUT = 15000;
const ACK_TIMEOUT = 60000;
const NAME_KEY = 'hyey-guest-name';

export function render(container) {
  const hostId = decodeURIComponent(location.hash.split('=')[1] || '');

  container.innerHTML = `
    <section class="iv-join">
      <p class="iv-eyebrow">Have You Eaten Yet?</p>
      <h1 class="iv-join-title">Connecting…</h1>
      <p class="iv-join-sub muted">Finding your friend's phone.</p>

      <div class="iv-join-body" hidden>
        <div class="up-field">
          <label for="iv-name">Your name <span class="muted">(optional)</span></label>
          <input id="iv-name" class="input" type="text" autocomplete="given-name" maxlength="40" placeholder="So they know who sent it">
        </div>
        <input id="iv-file" class="visually-hidden" type="file" accept="image/*" multiple tabindex="-1" aria-hidden="true">
        <button type="button" class="btn btn-primary iv-pick">📷 Choose photos to send</button>
        <p class="iv-send-status" role="status" aria-live="polite"></p>
        <ul class="iv-sent" aria-label="Sent photos"></ul>
      </div>

      <div class="iv-join-error" hidden>
        <p class="iv-error"></p>
        <button type="button" class="btn iv-retry">Try again</button>
      </div>
    </section>`;

  const $ = (sel) => container.querySelector(sel);
  const title = $('.iv-join-title');
  const sub = $('.iv-join-sub');
  const body = $('.iv-join-body');
  const nameInput = $('#iv-name');
  const fileInput = $('#iv-file');
  const pickBtn = $('.iv-pick');
  const status = $('.iv-send-status');
  const sent = $('.iv-sent');
  const errorBox = $('.iv-join-error');

  let peer = null;
  let conn = null;
  let alive = true;
  let sending = false;
  let sentTotal = 0;
  let connectTimer = null;
  const pending = new Map(); // photo id -> resolve

  try { nameInput.value = localStorage.getItem(NAME_KEY) || ''; } catch { /* storage unavailable */ }
  nameInput.addEventListener('input', () => {
    try { localStorage.setItem(NAME_KEY, nameInput.value.trim()); } catch { /* ignore */ }
  });

  async function connect() {
    errorBox.hidden = true;
    title.textContent = 'Connecting…';
    sub.textContent = "Finding your friend's phone.";
    if (!hostId) return fail("This invite link looks incomplete. Ask your friend to share it again.", false);
    try {
      const Peer = await loadPeer();
      if (!alive) return;
      const me = new Peer(peerOptions());
      peer = me;
      const current = () => peer === me;
      connectTimer = setTimeout(() => fail(), CONNECT_TIMEOUT);
      me.on('open', () => {
        if (!current()) return;
        conn = me.connect(hostId, { reliable: true });
        conn.on('data', onData);
        conn.on('close', () => { if (current()) fail('Your friend closed the invite. Ask them to open it again to send more.'); });
        conn.on('error', () => { if (current()) fail(); });
      });
      me.on('error', (err) => { console.warn('Join error', err); if (current()) fail(); });
    } catch (err) {
      console.warn('Join failed', err);
      fail();
    }
  }

  function onData(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'hello') {
      clearTimeout(connectTimer);
      const trip = typeof msg.trip === 'string' && msg.trip.trim();
      title.innerHTML = trip ? `Send your photos to <em>${escapeHtml(trip)}</em>` : 'Send your food photos';
      sub.textContent = 'They go straight to your friend\'s phone. Nothing is uploaded to a server.';
      body.hidden = false;
      errorBox.hidden = true;
    } else if ((msg.type === 'ack' || msg.type === 'reject') && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  }

  function fail(message = "Couldn't reach your friend's phone. Make sure their invite is still open, then try again.", canRetry = true) {
    if (!alive) return;
    clearTimeout(connectTimer);
    pending.forEach((resolve) => resolve({ type: 'reject', reason: 'disconnected' }));
    pending.clear();
    // Clear first: destroying the peer fires 'close', which must not re-enter.
    const old = peer;
    peer = null;
    conn = null;
    if (old) old.destroy();
    body.hidden = true;
    title.textContent = sentTotal ? `Sent ${sentTotal} photo${sentTotal === 1 ? '' : 's'} ✓` : 'Not connected';
    sub.textContent = '';
    errorBox.querySelector('.iv-error').textContent = message;
    errorBox.querySelector('.iv-retry').hidden = !canRetry;
    errorBox.hidden = false;
  }

  function sendPhoto(image) {
    const id = newId();
    return new Promise((resolve) => {
      const timer = setTimeout(() => { pending.delete(id); resolve({ type: 'reject', reason: 'timeout' }); }, ACK_TIMEOUT);
      pending.set(id, (msg) => { clearTimeout(timer); resolve(msg); });
      conn.send({ type: 'photo', id, image, from: nameInput.value.trim() });
    });
  }

  async function handleFiles(files) {
    const photos = files.filter(looksLikeImage);
    if (!photos.length || !conn) return;
    sending = true;
    pickBtn.disabled = true;
    let ok = 0;
    const problems = [];
    for (let i = 0; i < photos.length; i++) {
      if (!alive || !conn) break;
      status.textContent = `Sending ${i + 1} of ${photos.length}…`;
      let image;
      try {
        image = await downscale(photos[i]);
      } catch {
        problems.push(photos[i].name || 'a photo');
        continue;
      }
      const res = await sendPhoto(image);
      if (res.type === 'ack') {
        ok += 1;
        sentTotal += 1;
        sent.insertAdjacentHTML('beforeend', `<li><img src="${escapeHtml(image)}" alt=""><span aria-hidden="true">✓</span></li>`);
      } else if (res.reason === 'limit') {
        problems.push('the rest (photo limit reached)');
        break;
      } else if (res.reason === 'disconnected') {
        break;
      } else {
        problems.push(photos[i].name || 'a photo');
      }
    }
    sending = false;
    pickBtn.disabled = false;
    if (!alive || !conn) return;
    status.textContent = `Sent ${ok} of ${photos.length} ✓` + (problems.length ? ` · Couldn't send ${problems.join(', ')}` : '');
    pickBtn.textContent = '📷 Send more photos';
  }

  pickBtn.addEventListener('click', () => { if (!sending) fileInput.click(); });
  fileInput.addEventListener('change', () => {
    const files = [...fileInput.files];
    fileInput.value = '';
    handleFiles(files);
  });
  errorBox.querySelector('.iv-retry').addEventListener('click', connect);

  connect();

  return () => {
    alive = false;
    clearTimeout(connectTimer);
    if (peer) peer.destroy();
  };
}
