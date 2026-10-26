// Host side of "invite friends" (page 1). Shows a QR code; friends who scan it
// send photos straight to this phone, which adds them to the trip.
import { getTrip, updateTrip, newId, escapeHtml } from './state.js';
import { loadPeer, loadQr, newRoomId, joinUrl, peerOptions, MAX_IMAGE_CHARS, MAX_PER_GUEST } from './peer.js';

// Returns { stop, guests } where guests() is the number of connected friends.
export function openInvite(panel, { onStop } = {}) {
  let peer = null;
  let stopped = false;
  let received = 0;
  const conns = new Set();

  panel.hidden = false;
  panel.innerHTML = `
    <div class="iv-panel card">
      <div class="iv-head">
        <h3 class="iv-title">Collect photos from friends</h3>
        <button type="button" class="btn btn-ghost iv-stop">Stop</button>
      </div>
      <div class="iv-content"><p class="muted iv-loading">Creating your invite…</p></div>
    </div>`;
  const content = panel.querySelector('.iv-content');
  panel.querySelector('.iv-stop').addEventListener('click', () => stop());
  start();

  async function start() {
    try {
      const [Peer, qrcode] = await Promise.all([loadPeer(), loadQr()]);
      if (stopped) return;
      const id = newRoomId();
      peer = new Peer(id, peerOptions());
      peer.on('open', () => { if (!stopped) drawReady(qrcode, joinUrl(id)); });
      peer.on('connection', onConnection);
      // Lost the broker (not the friends): reconnect so new friends can still join.
      peer.on('disconnected', () => { if (!stopped && !peer.destroyed) peer.reconnect(); });
      peer.on('error', (err) => {
        console.warn('Invite error', err);
        if (!stopped && !content.querySelector('.iv-qr')) drawError();
      });
    } catch (err) {
      console.warn('Invite failed', err);
      if (!stopped) drawError();
    }
  }

  function onConnection(conn) {
    let count = 0;
    conn.on('open', () => {
      if (stopped) return conn.close();
      conns.add(conn);
      conn.send({ type: 'hello', trip: getTrip().name || '' });
      drawStatus();
    });
    conn.on('data', (msg) => {
      if (!msg || msg.type !== 'photo') return;
      const ref = String(msg.id ?? '').slice(0, 40);
      const { image } = msg;
      if (typeof image !== 'string' || !image.startsWith('data:image/jpeg;base64,') || image.length > MAX_IMAGE_CHARS) {
        conn.send({ type: 'reject', id: ref, reason: 'invalid' });
        return;
      }
      if (count >= MAX_PER_GUEST) {
        conn.send({ type: 'reject', id: ref, reason: 'limit' });
        return;
      }
      count += 1;
      received += 1;
      const from = typeof msg.from === 'string' ? msg.from.trim().slice(0, 40) : '';
      updateTrip((t) => ({
        ...t,
        dishes: [...t.dishes, { id: newId(), image, title: '', note: '', place: null, ...(from && { from }) }],
      }));
      conn.send({ type: 'ack', id: ref });
      drawStatus();
    });
    const drop = () => { conns.delete(conn); drawStatus(); };
    conn.on('close', drop);
    conn.on('error', drop);
  }

  function drawReady(qrcode, url) {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();
    content.innerHTML = `
      <p class="muted iv-lede">Friends scan this with their phone camera and pick photos. They come straight to this phone; nothing is uploaded to a server.</p>
      <div class="iv-qr">${qr.createSvgTag({ cellSize: 4, margin: 3, scalable: true, alt: 'QR code to send photos to this trip' })}</div>
      <div class="iv-link-row">
        <a class="iv-link" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(url.replace(/^https?:\/\//, ''))}</a>
        <button type="button" class="btn iv-share">${navigator.share ? 'Share link' : 'Copy link'}</button>
      </div>
      <p class="iv-status" role="status" aria-live="polite"></p>
      <p class="muted iv-hint">Keep this page open with the screen on until everyone's done.</p>`;
    content.querySelector('.iv-share').addEventListener('click', (e) => shareLink(url, e.currentTarget));
    drawStatus();
  }

  function drawStatus() {
    const el = content.querySelector('.iv-status');
    if (!el) return;
    const n = conns.size;
    const friends = n === 0 ? 'Waiting for friends…' : `${n} friend${n === 1 ? '' : 's'} connected`;
    el.textContent = received ? `${friends} · ${received} photo${received === 1 ? '' : 's'} received` : friends;
  }

  function drawError() {
    content.innerHTML = `
      <p class="iv-error">Couldn't create an invite. Check your internet connection and try again.</p>
      <button type="button" class="btn iv-retry">Try again</button>`;
    content.querySelector('.iv-retry').addEventListener('click', () => {
      if (peer) peer.destroy();
      content.innerHTML = '<p class="muted iv-loading">Creating your invite…</p>';
      start();
    });
  }

  async function shareLink(url, btn) {
    if (navigator.share) {
      try { await navigator.share({ title: 'Send me your food photos', url }); } catch { /* cancelled */ }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.textContent = 'Copy link'; }, 1500);
    } catch {
      prompt('Copy this link:', url);
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    conns.forEach((c) => c.close());
    conns.clear();
    if (peer) peer.destroy();
    panel.hidden = true;
    panel.innerHTML = '';
    if (onStop) onStop();
  }

  return { stop, guests: () => conns.size };
}
