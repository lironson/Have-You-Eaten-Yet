// Screen 3: the shareable / printable food guide.
import { getTrip, escapeHtml, mapsSearchUrl } from './state.js';

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

function safeUrl(url) {
  // Only allow http(s) links in the guide.
  return /^https?:\/\//i.test(url || '') ? url : '';
}

function slugify(s) {
  return s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'my-food-trip';
}

function todayLabel() {
  return new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
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

function guideHtml(trip) {
  const dishes = trip.dishes || [];
  const top = dishes.slice(0, 3);
  const rest = dishes.slice(3);
  const n = dishes.length;
  const subtitle = n === 1 ? 'My top bite — eat this if you visit.' : `My top ${n} bites — eat these if you visit.`;
  const author = (trip.author || '').trim();

  return `<article class="sm-guide">
    <header class="sm-head">
      <p class="sm-eyebrow">Have You Eaten Yet?</p>
      <h1 class="sm-title">${escapeHtml(tripName(trip))}</h1>
      <p class="sm-subtitle">${escapeHtml(subtitle)}</p>
      <p class="sm-meta">${author ? `<span>by ${escapeHtml(author)}</span><span class="sm-dot" aria-hidden="true">·</span>` : ''}<span>${escapeHtml(todayLabel())}</span></p>
    </header>

    ${top.length ? `<section class="sm-top" aria-labelledby="sm-top-h">
      <h2 class="sm-section-title" id="sm-top-h"><span>The Top ${top.length}</span></h2>
      <ol class="sm-podium sm-podium-${top.length}">${top.map(featureCard).join('')}</ol>
    </section>` : ''}

    ${rest.length ? `<section class="sm-rest" aria-labelledby="sm-rest-h">
      <h2 class="sm-section-title" id="sm-rest-h"><span>The rest</span></h2>
      <ol class="sm-list">${rest.map((d, i) => restItem(d, i + 3)).join('')}</ol>
    </section>` : ''}

    <footer class="sm-foot">Made with <strong>Have You Eaten Yet?</strong></footer>
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
  const [base, summary] = await Promise.all([readCss('css/base.css'), readCss('css/summary.css')]);
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
:root { color-scheme: light; }
</style>
</head>
<body class="sm-standalone">
<main id="app">
${guideHtml(trip)}
</main>
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
        <button type="button" class="btn" data-act="share">Share</button>
        <button type="button" class="btn btn-primary" data-act="download" title="A single HTML file with all photos inside. Best way to send the guide to friends.">Download page</button>
      </div>
      <p class="sm-toolbar-hint muted">Tip: <strong>Download page</strong> saves one file with every photo inside. Send it to friends; it opens in any browser.</p>
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
    else if (act === 'download') download(btn);
  }

  container.addEventListener('click', onClick);
  return () => {
    container.removeEventListener('click', onClick);
    clearTimeout(toastTimer);
  };
}
