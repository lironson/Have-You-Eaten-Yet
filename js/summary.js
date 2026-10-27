// Screen 3: the shareable / printable food guide.
import { getTrip, escapeHtml, mapsSearchUrl, SITE_URL, safeUrl } from './state.js';
import { shareUrl, canShareLinks } from './share.js';
import { mapSectionHtml, mountMap, standaloneMapScript, LEAFLET_CSS } from './map.js';

const FONT_LINKS = `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,600;9..144,800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`;

const MEDALS = ['gold', 'silver', 'bronze'];


function tripName(trip) {
  return (trip.name || '').trim() || 'My Food Trip';
}

function dishTitle(dish) {
  return (dish.title || '').trim() || 'Untitled dish';
}

function mapsUrlFor(dish) {
  const p = dish.place;
  if (!p) return '';
  if (p.mapsUrl) return p.mapsUrl;
  const q = [p.name, p.address].filter(Boolean).join(', ');
  return q ? mapsSearchUrl(q) : '';
}

export const pinUrl = (dish) => safeUrl(mapsUrlFor(dish));

function slugify(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my-food-trip';
}

// `iso` ("2026-10-26", from a shared link) or today.
function dateLabel(iso) {
  const [y, m, d] = (iso || '').split('-').map(Number);
  const date = y ? new Date(y, m - 1, d) : new Date();
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function linksHtml(dish) {
  const maps = safeUrl(mapsUrlFor(dish));
  const site = safeUrl(dish.place && dish.place.website);
  const links = [];
  if (maps) links.push(`<a class="sm-link" href="${escapeHtml(maps)}" target="_blank" rel="noopener">Google Maps <span class="sm-arrow" aria-hidden="true">↗</span></a>`);
  if (site) links.push(`<a class="sm-link" href="${escapeHtml(site)}" target="_blank" rel="noopener">Website <span class="sm-arrow" aria-hidden="true">↗</span></a>`);
  return links.length ? `<p class="sm-links">${links.join('')}</p>` : '';
}

function imageHtml(dish, cls) {
  return dish.image
    ? `<img class="${cls}" src="${escapeHtml(dish.image)}" alt="${escapeHtml(dishTitle(dish))}">`
    : `<div class="${cls} sm-img-empty" aria-hidden="true">🍜</div>`;
}

function placeHtml(dish) {
  const p = dish.place;
  if (!p || !(p.name || p.address)) return '';
  return `<p class="sm-place">${p.name ? `<span class="sm-place-name">${escapeHtml(p.name)}</span>` : ''}${
    p.address ? `<span class="sm-address">${escapeHtml(p.address)}</span>` : ''}</p>`;
}

function featureCard(dish, i) {
  return `<li class="sm-feature sm-feature-${i + 1}">
    <div class="sm-feature-media">
      ${imageHtml(dish, 'sm-feature-img')}
      <span class="sm-medal sm-medal-${MEDALS[i]}" aria-label="Rank ${i + 1}">${i + 1}</span>
    </div>
    <div class="sm-feature-body">
      <h3 class="sm-dish-title">${escapeHtml(dishTitle(dish))}</h3>
      ${placeHtml(dish)}
      ${dish.note ? `<p class="sm-note">${escapeHtml(dish.note)}</p>` : ''}
      ${linksHtml(dish)}
    </div>
  </li>`;
}

function restItem(dish, i) {
  const maps = safeUrl(mapsUrlFor(dish));
  const name = dish.place && dish.place.name;
  return `<li class="sm-item">
    ${imageHtml(dish, 'sm-thumb')}
    <span class="sm-item-rank" aria-label="Rank ${i + 1}">${i + 1}</span>
    <div class="sm-item-body">
      <h3 class="sm-item-title">${escapeHtml(dishTitle(dish))}</h3>
      ${name ? `<p class="sm-item-place">${escapeHtml(name)}</p>` : ''}
      ${dish.note ? `<p class="sm-item-note">${escapeHtml(dish.note)}</p>` : ''}
      ${maps ? `<a class="sm-link sm-item-link" href="${escapeHtml(maps)}" target="_blank" rel="noopener">Google Maps <span class="sm-arrow" aria-hidden="true">↗</span></a>` : ''}
    </div>
  </li>`;
}

// One line of the shared-map list: no photo, just the rank and the text.
function textItem(dish, i) {
  const p = dish.place;
  const medal = i < 3 ? ` sm-medal-${MEDALS[i]}` : '';
  return `<li class="sm-text-item">
    <span class="sm-text-rank${medal}" aria-label="Rank ${i + 1}">${i + 1}</span>
    <div class="sm-text-body">
      <h3 class="sm-item-title">${escapeHtml(dishTitle(dish))}</h3>
      ${p && p.name ? `<p class="sm-item-place">${escapeHtml(p.name)}${p.address ? `<span class="sm-text-addr"> · ${escapeHtml(p.address)}</span>` : ''}</p>` : ''}
      ${dish.note ? `<p class="sm-item-note">${escapeHtml(dish.note)}</p>` : ''}
      ${linksHtml(dish)}
    </div>
  </li>`;
}

// `live`: the on-screen summary (false for the downloaded page or a shared
// link). `shared`: a "Share map" link: no photos, so it's the map plus one
// compact numbered list instead of photo cards.
export function guideHtml(trip, { live = true, shared = false } = {}) {
  const dishes = trip.dishes || [];
  const top = dishes.slice(0, 3);
  const rest = dishes.slice(3);
  const n = dishes.length;
  const subtitle = n === 1 ? 'My top bite — eat this if you visit.' : `My top ${n} bites — eat these if you visit.`;
  const author = (trip.author || '').trim();

  const head = `<header class="sm-head">
      <p class="sm-eyebrow">Have You Eaten Yet?</p>
      <h1 class="sm-title">${escapeHtml(tripName(trip))}</h1>
      <p class="sm-subtitle">${escapeHtml(subtitle)}</p>
      <p class="sm-meta">${author ? `<span>by ${escapeHtml(author)}</span><span class="sm-dot" aria-hidden="true">·</span>` : ''}<span>${escapeHtml(dateLabel(trip.date))}</span></p>
    </header>`;
  const foot = `<footer class="sm-foot">Made with <a class="sm-foot-link" href="${SITE_URL}" target="_blank" rel="noopener"><strong>Have You Eaten Yet?</strong></a><span class="sm-foot-url"> · ${SITE_URL.replace(/^https:\/\//, '').replace(/\/$/, '')}</span></footer>`;

  if (shared) {
    return `<article class="sm-guide sm-guide--shared">
    ${head}
    ${mapSectionHtml(trip, live, true)}
    ${n ? `<section class="sm-textlist-wrap" aria-labelledby="sm-list-h">
      <h2 class="sm-section-title" id="sm-list-h"><span>The ranking</span></h2>
      <ol class="sm-textlist">${dishes.map(textItem).join('')}</ol>
    </section>` : ''}
    ${foot}
  </article>`;
  }

  return `<article class="sm-guide">
    <div class="sm-page1">
    ${head}

    ${top.length ? `<section class="sm-top" aria-labelledby="sm-top-h">
      <h2 class="sm-section-title" id="sm-top-h"><span>The Top ${top.length}</span></h2>
      <ol class="sm-podium sm-podium-${top.length}">${top.map(featureCard).join('')}</ol>
    </section>` : ''}
    </div>

    ${mapSectionHtml(trip, live)}

    ${rest.length ? `<section class="sm-rest" aria-labelledby="sm-rest-h">
      <h2 class="sm-section-title" id="sm-rest-h"><span>The rest</span></h2>
      <ol class="sm-list">${rest.map((d, i) => restItem(d, i + 3)).join('')}</ol>
    </section>` : ''}

    ${foot}
  </article>`;
}

export function plainText(trip) {
  const lines = [`${tripName(trip)} — my food rankings`];
  (trip.dishes || []).forEach((d, i) => {
    let line = `${i + 1}. ${dishTitle(d)}`;
    if (d.place && d.place.name) line += ` @ ${d.place.name}`;
    const maps = mapsUrlFor(d);
    if (maps) line += ` — ${maps}`;
    lines.push(line);
  });
  lines.push('', `Made with Have You Eaten Yet? ${SITE_URL}`);
  return lines.join('\n');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

async function readCss(file) {
  try {
    const res = await fetch(file);
    if (res.ok) return await res.text();
  } catch { /* fall through */ }
  // Fallback: serialize the already-loaded stylesheet.
  for (const sheet of document.styleSheets) {
    if (sheet.href && sheet.href.endsWith(file)) {
      try { return Array.from(sheet.cssRules, (r) => r.cssText).join('\n'); } catch { /* cross-origin */ }
    }
  }
  return '';
}

async function buildStandaloneHtml(trip) {
  const [base, summary, map, leaflet, mapScript] = await Promise.all([
    readCss('css/base.css'), readCss('css/summary.css'), readCss('css/map.css'), readCss(LEAFLET_CSS),
    standaloneMapScript(trip, pinUrl),
  ]);
  const title = `${tripName(trip)} — food guide`;
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
${FONT_LINKS}
<style>
${base}
${summary}
${leaflet}
${map}
:root { color-scheme: light; }
</style>
</head>
<body class="sm-standalone">
<main id="app">
${guideHtml(trip, { live: false })}
</main>
${mapScript}
</body>
</html>`;
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function render(container) {
  const trip = getTrip();
  let toastTimer = null;

  container.innerHTML = `<section class="sm-screen">
    <div class="sm-toolbar no-print" role="toolbar" aria-label="Guide actions">
      <a class="btn btn-ghost sm-back" href="#rank">← Edit rankings</a>
      <div class="sm-toolbar-actions">
        <button type="button" class="btn" data-act="print">Print / Save PDF</button>
        <button type="button" class="btn" data-act="share-link">Share map</button>
        <button type="button" class="btn" data-act="share">Share text</button>
        <button type="button" class="btn btn-primary" data-act="download" title="A single HTML file with all photos inside. Best way to send the guide to friends.">Download page</button>
      </div>
      <p class="sm-toolbar-hint muted">Tip: <strong>Share map</strong> sends a link to the map and ranked list that opens on any phone (no photos). <strong>Download page</strong> saves one file with every photo inside.</p>
    </div>
    ${guideHtml(trip)}
    <div class="sm-toast no-print" role="status" aria-live="polite"></div>
  </section>`;

  const toast = container.querySelector('.sm-toast');
  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('sm-toast-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('sm-toast-show'), 2000);
  }

  async function share() {
    const text = plainText(trip);
    const title = `${tripName(trip)} — my food rankings`;
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;
      }
    }
    showToast((await copyText(text)) ? 'Copied!' : 'Could not copy');
  }

  async function shareLink(btn) {
    if (!canShareLinks()) { showToast("Your browser can't make share links"); return; }
    btn.disabled = true;
    try {
      const url = await shareUrl(trip);
      const long = url.length > 8000;
      if (navigator.share) {
        if (long) showToast("It's a long link, so some apps may cut it off");
        try {
          await navigator.share({ title: `${tripName(trip)} — food map`, url });
          return;
        } catch (err) {
          if (err && err.name === 'AbortError') return;
        }
      }
      const ok = await copyText(url);
      showToast(!ok ? 'Could not copy' : long ? "Copied! It's long, so some apps may cut it off" : 'Copied!');
    } catch (err) {
      console.warn('Share map failed', err);
      showToast('Could not make a link');
    } finally {
      btn.disabled = false;
    }
  }

  async function download(btn) {
    btn.disabled = true;
    try {
      const html = await buildStandaloneHtml(trip);
      downloadFile(`${slugify(tripName(trip))}-food-guide.html`, html, 'text/html;charset=utf-8');
      showToast('Guide downloaded');
    } catch (err) {
      console.warn('Download failed', err);
      showToast('Download failed');
    } finally {
      btn.disabled = false;
    }
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === 'print') window.print();
    else if (act === 'share') share();
    else if (act === 'share-link') shareLink(btn);
    else if (act === 'download') download(btn);
  }

  container.addEventListener('click', onClick);
  const unmountMap = mountMap(container, trip, pinUrl);
  return () => {
    unmountMap();
    container.removeEventListener('click', onClick);
    clearTimeout(toastTimer);
  };
}
