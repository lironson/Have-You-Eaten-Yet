// Read-only guide opened from a "Share map" link (#view=<data>): the map
// and a compact ranked list, built from the link alone. It never reads
// or writes the viewer's own trip, and never looks anything up.
import { decodeGuide } from './share.js';
import { guideHtml, pinUrl } from './summary.js';
import { mountMap } from './map.js';

export function render(container) {
  const data = location.hash.slice(location.hash.indexOf('=') + 1);
  let alive = true;
  let unmountMap = null;

  container.innerHTML = '<p class="vw-loading muted">Opening guide…</p>';

  decodeGuide(data).then((guide) => {
    if (!alive) return;
    container.innerHTML = `<section class="vw">
      <div class="vw-bar"><a class="vw-make" href="./#upload">Make your own food guide →</a></div>
      ${guideHtml(guide, { live: false, shared: true })}
    </section>`;
    unmountMap = mountMap(container, guide, pinUrl, { readOnly: true });
  }).catch((err) => {
    if (!alive) return;
    console.warn('Could not open guide link', err);
    container.innerHTML = `<section class="vw-error card">
      <p class="vw-error-icon" aria-hidden="true">🍜</p>
      <h1 class="vw-error-title">This guide link is incomplete</h1>
      <p class="muted">Ask your friend to share it again, or make sure you copied the whole link.</p>
      <a class="btn btn-primary" href="./#upload">Make your own food guide →</a>
    </section>`;
  });

  return () => {
    alive = false;
    if (unmountMap) unmountMap();
  };
}
