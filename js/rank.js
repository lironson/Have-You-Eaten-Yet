// Screen 2: rank the dishes. Array order of trip.dishes is the ranking.
// Text edits update state without re-rendering (keeps focus); the list is
// only re-rendered on reorder, delete, or place change.
import { getTrip, updateTrip, mapsSearchUrl, escapeHtml } from './state.js';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=';
const SEARCH_DEBOUNCE = 400;
const SAVE_DEBOUNCE = 300;

const ICONS = {
  grip: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></g></svg>',
  up: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 15l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  down: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
};

export function render(container) {
  container.innerHTML = `
    <section class="rk">
      <header class="rk-head">
        <h1>Rank your bites</h1>
        <p class="muted">Drag to reorder. #1 is the best thing you ate.</p>
      </header>
      <ol class="rk-list" aria-label="Ranked dishes"></ol>
      <p class="visually-hidden" aria-live="polite" data-rk-live></p>
      <div class="actions">
        <a class="btn" href="#upload">← Add more photos</a>
        <a class="btn btn-primary" href="#summary">See summary →</a>
      </div>
    </section>`;

  const list = container.querySelector('.rk-list');
  const live = container.querySelector('[data-rk-live]');
  const searchCache = new Map();
  const searchTimers = new Map(); // dish id -> timeout
  let searchAbort = null;
  let saveTimer = null;
  let drag = null;
  let lightbox = null;

  const dishById = (id) => getTrip().dishes.find((d) => d.id === id);
  const announce = (msg) => { live.textContent = msg; };

  // ---------- persistence for text edits (no re-render) ----------
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flushSave, SAVE_DEBOUNCE);
  }
  function flushSave() {
    if (saveTimer === null) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    updateTrip((t) => t);
  }
  function editDish(id, fn) {
    const dish = dishById(id);
    if (!dish) return;
    fn(dish);
    scheduleSave();
  }

  // ---------- rendering ----------
  function cardHtml(dish, i, total) {
    const rank = i + 1;
    const medal = rank <= 3 ? ` rk-badge--${rank}` : '';
    const title = dish.title || '';
    const label = title ? escapeHtml(title) : `dish ${rank}`;
    return `
      <li class="rk-card card" data-id="${escapeHtml(dish.id)}">
        <div class="rk-top">
          <span class="rk-badge${medal}" aria-label="Rank ${rank}">#${rank}</span>
          <button type="button" class="rk-thumb" data-act="zoom" aria-label="Enlarge photo of ${label}">
            <img src="${escapeHtml(dish.image || '')}" alt="" loading="lazy" draggable="false">
          </button>
          <div class="rk-ctrl">
            <button type="button" class="rk-icon rk-handle" aria-label="Drag to reorder ${label} (or use arrow keys)">${ICONS.grip}</button>
            <button type="button" class="rk-icon" data-act="up" aria-label="Move ${label} up" ${i === 0 ? 'disabled' : ''}>${ICONS.up}</button>
            <button type="button" class="rk-icon" data-act="down" aria-label="Move ${label} down" ${i === total - 1 ? 'disabled' : ''}>${ICONS.down}</button>
            <button type="button" class="rk-icon rk-del" data-act="delete" aria-label="Delete ${label}">${ICONS.close}</button>
          </div>
        </div>
        <div class="rk-fields">
          <label class="visually-hidden" for="rk-title-${escapeHtml(dish.id)}">Dish name</label>
          <input class="input rk-title" id="rk-title-${escapeHtml(dish.id)}" data-field="title" type="text"
            placeholder="What was it?" value="${escapeHtml(title)}" autocomplete="off" maxlength="120">
          <label class="visually-hidden" for="rk-note-${escapeHtml(dish.id)}">Short note</label>
          <input class="input rk-note" id="rk-note-${escapeHtml(dish.id)}" data-field="note" type="text"
            placeholder="Tip: order the spicy version" value="${escapeHtml(dish.note || '')}" autocomplete="off" maxlength="200">
          ${placeHtml(dish)}
        </div>
      </li>`;
  }

  function placeHtml(dish) {
    const id = escapeHtml(dish.id);
    const p = dish.place;
    if (p) {
      return `
        <div class="rk-place">
          <div class="rk-chip">
            <span class="rk-chip-text">
              <strong>${escapeHtml(p.name)}</strong>
              ${p.address ? `<span class="muted">${escapeHtml(p.address)}</span>` : ''}
            </span>
            ${p.mapsUrl ? `<a class="rk-chip-map" href="${escapeHtml(p.mapsUrl)}" target="_blank" rel="noopener">Map ↗</a>` : ''}
            <button type="button" class="rk-chip-x" data-act="clear-place" aria-label="Remove restaurant ${escapeHtml(p.name)}">${ICONS.close}</button>
          </div>
          <label class="visually-hidden" for="rk-web-${id}">Restaurant website</label>
          <input class="input rk-website" id="rk-web-${id}" data-field="website" type="url" inputmode="url"
            placeholder="Website (optional)" value="${escapeHtml(p.website || '')}" autocomplete="off">
        </div>`;
    }
    return `
      <div class="rk-search-wrap">
        <label class="visually-hidden" for="rk-search-${id}">Restaurant</label>
        <input class="input rk-search" id="rk-search-${id}" type="search" placeholder="Search restaurant…"
          autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false"
          aria-controls="rk-dd-${id}">
        <ul class="rk-dd" id="rk-dd-${id}" role="listbox" hidden></ul>
      </div>`;
  }

  function renderList(focus) {
    const { dishes } = getTrip();
    list.innerHTML = dishes.map((d, i) => cardHtml(d, i, dishes.length)).join('');
    if (focus) {
      const el = list.querySelector(`.rk-card[data-id="${CSS.escape(focus.id)}"] ${focus.sel}`);
      if (el && !el.disabled) el.focus();
      else list.querySelector(`.rk-card[data-id="${CSS.escape(focus.id)}"] .rk-handle`)?.focus();
    }
  }

  // ---------- reorder / delete ----------
  function moveDish(id, delta, focusSel) {
    const dishes = getTrip().dishes;
    const from = dishes.findIndex((d) => d.id === id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= dishes.length) return;
    flushSave();
    updateTrip((t) => {
      const [d] = t.dishes.splice(from, 1);
      t.dishes.splice(to, 0, d);
    });
    renderList({ id, sel: focusSel });
    const d = dishById(id);
    announce(`${d.title || 'Dish'} moved to #${to + 1}`);
  }

  function deleteDish(id) {
    const d = dishById(id);
    if (!d) return;
    if (!confirm(`Delete ${d.title ? `"${d.title}"` : 'this dish'}?`)) return;
    flushSave();
    updateTrip((t) => { t.dishes = t.dishes.filter((x) => x.id !== id); });
    if (getTrip().dishes.length === 0) { location.hash = 'upload'; return; }
    renderList();
    announce('Dish deleted');
  }

  function setPlace(id, place) {
    flushSave();
    updateTrip((t) => {
      const d = t.dishes.find((x) => x.id === id);
      if (d) d.place = place;
    });
    renderList({ id, sel: place ? '.rk-website' : '.rk-search' });
  }

  // ---------- restaurant search ----------
  function shortAddress(display, name) {
    const parts = String(display || '').split(',').map((s) => s.trim()).filter(Boolean);
    if (parts[0] === name) parts.shift();
    return parts.slice(0, 3).join(', ');
  }

  async function nominatim(q, signal) {
    if (searchCache.has(q)) return searchCache.get(q);
    const res = await fetch(NOMINATIM + encodeURIComponent(q), { signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const out = (Array.isArray(data) ? data : []).map((r) => {
      const name = r.name || String(r.display_name || '').split(',')[0].trim();
      return { name, address: shortAddress(r.display_name, name) };
    }).filter((r) => r.name);
    searchCache.set(q, out);
    return out;
  }

  function ddState(input) {
    if (!input._rk) input._rk = { results: [], active: -1, loading: false, failed: false };
    return input._rk;
  }

  function ddOptions(input) {
    const st = ddState(input);
    const typed = input.value.trim();
    const opts = st.results.map((r) => ({ kind: 'result', ...r }));
    if (typed) opts.push({ kind: 'typed', name: typed });
    return opts;
  }

  function drawDropdown(input) {
    const dd = input.parentElement.querySelector('.rk-dd');
    const st = ddState(input);
    const opts = ddOptions(input);
    if (!opts.length && !st.loading) { closeDropdown(input); return; }
    const idBase = dd.id;
    let html = opts.map((o, i) => `
      <li role="option" id="${idBase}-${i}" data-i="${i}" class="rk-opt${i === st.active ? ' is-active' : ''}${o.kind === 'typed' ? ' rk-opt--typed' : ''}"
        aria-selected="${i === st.active}">
        ${o.kind === 'typed'
          ? `Use “${escapeHtml(o.name)}”`
          : `<strong>${escapeHtml(o.name)}</strong>${o.address ? `<span class="muted">${escapeHtml(o.address)}</span>` : ''}`}
      </li>`).join('');
    if (st.loading) html = `<li class="rk-dd-status muted" aria-hidden="true">Searching…</li>` + html;
    else if (st.failed) html = `<li class="rk-dd-status muted" aria-hidden="true">Search unavailable</li>` + html;
    dd.innerHTML = html;
    dd.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    if (st.active >= 0) input.setAttribute('aria-activedescendant', `${idBase}-${st.active}`);
    else input.removeAttribute('aria-activedescendant');
  }

  function closeDropdown(input) {
    const dd = input.parentElement.querySelector('.rk-dd');
    if (dd) { dd.hidden = true; dd.innerHTML = ''; }
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    ddState(input).active = -1;
  }

  function closeAllDropdowns(except) {
    list.querySelectorAll('.rk-search[aria-expanded="true"]').forEach((i) => { if (i !== except) closeDropdown(i); });
  }

  function onSearchInput(input, id) {
    const st = ddState(input);
    const q = input.value.trim();
    clearTimeout(searchTimers.get(id));
    st.active = -1;
    st.failed = false;
    if (q.length < 3) {
      st.results = [];
      st.loading = false;
      drawDropdown(input);
      return;
    }
    st.loading = true;
    drawDropdown(input);
    searchTimers.set(id, setTimeout(async () => {
      if (searchAbort) searchAbort.abort();
      const ctrl = new AbortController();
      searchAbort = ctrl;
      const city = (getTrip().name || '').trim();
      try {
        let results = await nominatim(q, ctrl.signal);
        if (!results.length && city) results = await nominatim(`${q} ${city}`, ctrl.signal);
        if (input.value.trim() !== q) return; // stale
        st.results = results;
      } catch (err) {
        if (err.name === 'AbortError') return;
        st.results = [];
        st.failed = true;
      }
      st.loading = false;
      if (document.activeElement === input) drawDropdown(input);
    }, SEARCH_DEBOUNCE));
  }

  function chooseOption(input, id, i) {
    const opt = ddOptions(input)[i];
    if (!opt) return;
    if (opt.kind === 'typed') {
      const city = (getTrip().name || '').trim();
      setPlace(id, { name: opt.name, address: '', mapsUrl: mapsSearchUrl(city ? `${opt.name} ${city}` : opt.name), website: '' });
    } else {
      setPlace(id, { name: opt.name, address: opt.address, mapsUrl: mapsSearchUrl(`${opt.name} ${opt.address}`.trim()), website: '' });
    }
  }

  function onSearchKey(e, input, id) {
    const st = ddState(input);
    const n = ddOptions(input).length;
    const open = input.getAttribute('aria-expanded') === 'true';
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!n) return;
      e.preventDefault();
      if (!open) { st.active = e.key === 'ArrowDown' ? 0 : n - 1; }
      else st.active = e.key === 'ArrowDown' ? (st.active + 1) % n : (st.active - 1 + n) % n;
      drawDropdown(input);
      document.getElementById(`${input.getAttribute('aria-controls')}-${st.active}`)?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      if (!n) return;
      e.preventDefault();
      chooseOption(input, id, st.active >= 0 ? st.active : n - 1); // default: typed text
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); closeDropdown(input); }
    }
  }

  // ---------- lightbox ----------
  function openLightbox(src, alt) {
    closeLightbox();
    const opener = document.activeElement;
    lightbox = document.createElement('div');
    lightbox.className = 'rk-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', alt);
    lightbox.innerHTML = `<img src="${escapeHtml(src)}" alt="${escapeHtml(alt)}"><button type="button" class="rk-lightbox-x" aria-label="Close">${ICONS.close}</button>`;
    const close = () => { closeLightbox(); opener?.focus?.(); };
    lightbox.addEventListener('click', close);
    lightbox.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.body.appendChild(lightbox);
    lightbox.querySelector('button').focus();
  }
  function closeLightbox() {
    if (lightbox) { lightbox.remove(); lightbox = null; }
  }

  // ---------- drag to reorder (Pointer Events) ----------
  function startDrag(e, handle) {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const card = handle.closest('.rk-card');
    if (!card) return;
    e.preventDefault();
    closeAllDropdowns();
    document.activeElement?.blur?.();
    const rect = card.getBoundingClientRect();
    const placeholder = document.createElement('li');
    placeholder.className = 'rk-placeholder';
    placeholder.style.height = rect.height + 'px';
    card.after(placeholder);
    card.classList.add('rk-dragging');
    Object.assign(card.style, { width: rect.width + 'px', left: rect.left + 'px', top: rect.top + 'px' });
    document.body.classList.add('rk-no-select');
    handle.setPointerCapture(e.pointerId);
    drag = {
      card, handle, placeholder, pointerId: e.pointerId,
      offsetY: e.clientY - rect.top, y: e.clientY, raf: 0,
      startIndex: [...list.children].indexOf(card),
    };
    drag.raf = requestAnimationFrame(dragTick);
  }

  function dragMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    e.preventDefault();
    drag.y = e.clientY;
    positionDrag();
  }

  function positionDrag() {
    const { card, placeholder } = drag;
    card.style.top = (drag.y - drag.offsetY) + 'px';
    const others = [...list.querySelectorAll('.rk-card:not(.rk-dragging)')];
    const cardRect = card.getBoundingClientRect();
    const centerY = cardRect.top + cardRect.height / 2;
    let before = null;
    for (const el of others) {
      const r = el.getBoundingClientRect();
      if (centerY < r.top + r.height / 2) { before = el; break; }
    }
    if (before) { if (placeholder.nextElementSibling !== before) list.insertBefore(placeholder, before); }
    else if (list.lastElementChild !== placeholder) list.appendChild(placeholder);
  }

  // Auto-scroll when the pointer nears the top/bottom of the viewport.
  function dragTick() {
    if (!drag) return;
    const edge = Math.min(90, window.innerHeight * 0.15);
    let dy = 0;
    if (drag.y < edge) dy = -Math.ceil(((edge - drag.y) / edge) * 18);
    else if (drag.y > window.innerHeight - edge) dy = Math.ceil(((drag.y - (window.innerHeight - edge)) / edge) * 18);
    if (dy) {
      const before = window.scrollY;
      window.scrollBy(0, dy);
      if (window.scrollY !== before) positionDrag();
    }
    drag.raf = requestAnimationFrame(dragTick);
  }

  function endDrag(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const { card, placeholder, handle, startIndex } = drag;
    cancelAnimationFrame(drag.raf);
    try { handle.releasePointerCapture(drag.pointerId); } catch { /* already released */ }
    drag = null;
    document.body.classList.remove('rk-no-select');
    placeholder.replaceWith(card);
    card.classList.remove('rk-dragging');
    card.removeAttribute('style');
    const ids = [...list.querySelectorAll('.rk-card')].map((el) => el.dataset.id);
    const newIndex = ids.indexOf(card.dataset.id);
    if (newIndex !== startIndex) {
      flushSave();
      updateTrip((t) => {
        const byId = new Map(t.dishes.map((d) => [d.id, d]));
        t.dishes = ids.map((id) => byId.get(id)).filter(Boolean);
      });
      const d = dishById(card.dataset.id);
      announce(`${d?.title || 'Dish'} moved to #${newIndex + 1}`);
    }
    renderList();
  }

  // ---------- event wiring (delegated) ----------
  function onInput(e) {
    const t = e.target;
    const card = t.closest('.rk-card');
    if (!card) return;
    const id = card.dataset.id;
    if (t.classList.contains('rk-search')) { onSearchInput(t, id); return; }
    const field = t.dataset.field;
    if (field === 'title' || field === 'note') editDish(id, (d) => { d[field] = t.value; });
    else if (field === 'website') editDish(id, (d) => { if (d.place) d.place.website = t.value.trim(); });
  }

  function onChange(e) {
    // Normalise website on commit: add https:// if the scheme is missing.
    const t = e.target;
    if (t.dataset.field !== 'website') return;
    const v = t.value.trim();
    if (v && !/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) {
      t.value = 'https://' + v;
      editDish(t.closest('.rk-card').dataset.id, (d) => { if (d.place) d.place.website = t.value; });
    }
  }

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || !list.contains(btn)) return;
    const id = btn.closest('.rk-card').dataset.id;
    switch (btn.dataset.act) {
      case 'up': moveDish(id, -1, '[data-act="up"]'); break;
      case 'down': moveDish(id, 1, '[data-act="down"]'); break;
      case 'delete': deleteDish(id); break;
      case 'clear-place': setPlace(id, null); break;
      case 'zoom': {
        const d = dishById(id);
        if (d?.image) openLightbox(d.image, d.title || 'Dish photo');
        break;
      }
    }
  }

  function onKeyDown(e) {
    const t = e.target;
    const card = t.closest?.('.rk-card');
    if (!card) return;
    if (t.classList.contains('rk-search')) { onSearchKey(e, t, card.dataset.id); return; }
    if (t.classList.contains('rk-handle') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      moveDish(card.dataset.id, e.key === 'ArrowUp' ? -1 : 1, '.rk-handle');
    }
  }

  function onPointerDown(e) {
    const handle = e.target.closest('.rk-handle');
    if (handle && list.contains(handle)) { startDrag(e, handle); return; }
    // Picking a dropdown option: mousedown-style select that keeps input focus.
    const opt = e.target.closest('.rk-opt');
    if (opt) {
      e.preventDefault();
      const input = opt.closest('.rk-search-wrap').querySelector('.rk-search');
      chooseOption(input, opt.closest('.rk-card').dataset.id, Number(opt.dataset.i));
    }
  }

  function onFocusIn(e) {
    const t = e.target;
    if (t.classList?.contains('rk-search')) {
      closeAllDropdowns(t);
      if (t.value.trim()) drawDropdown(t);
    } else closeAllDropdowns();
  }

  function onDocPointerDown(e) {
    if (!e.target.closest?.('.rk-search-wrap')) closeAllDropdowns();
  }

  list.addEventListener('input', onInput);
  list.addEventListener('change', onChange);
  list.addEventListener('click', onClick);
  list.addEventListener('keydown', onKeyDown);
  list.addEventListener('pointerdown', onPointerDown);
  list.addEventListener('pointermove', dragMove);
  list.addEventListener('pointerup', endDrag);
  list.addEventListener('pointercancel', endDrag);
  list.addEventListener('lostpointercapture', endDrag);
  list.addEventListener('focusin', onFocusIn);
  // Prevent native image/link drag ghosts interfering with pointer drag.
  list.addEventListener('dragstart', (e) => e.preventDefault());
  document.addEventListener('pointerdown', onDocPointerDown);

  renderList();

  return () => {
    flushSave();
    if (drag) endDrag();
    searchTimers.forEach((t) => clearTimeout(t));
    if (searchAbort) searchAbort.abort();
    closeLightbox();
    document.body.classList.remove('rk-no-select');
    document.removeEventListener('pointerdown', onDocPointerDown);
  };
}
