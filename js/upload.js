// Screen 1: Upload. Name the trip and add food photos.
import { getTrip, updateTrip, subscribe, newId, escapeHtml } from './state.js';

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export function render(container) {
  const trip = getTrip();

  container.innerHTML = `
    <section class="up-screen">
      <div class="up-hero">
        <h1 class="up-title">Have You Eaten Yet?</h1>
        <p class="up-subtitle muted">Back from a trip? Upload photos of the dishes and places you loved, and we'll turn them into a ranked food guide you can share.</p>
      </div>

      <div class="up-fields">
        <div class="up-field">
          <label for="up-trip-name">Trip name</label>
          <input id="up-trip-name" class="input" type="text" autocomplete="off"
            placeholder="e.g. Tokyo, Spring 2026" value="${escapeHtml(trip.name || '')}">
        </div>
        <div class="up-field">
          <label for="up-author">Your name <span class="muted">(optional)</span></label>
          <input id="up-author" class="input" type="text" autocomplete="name"
            placeholder="e.g. Alex" value="${escapeHtml(trip.author || '')}">
        </div>
      </div>

      <input id="up-file" class="visually-hidden" type="file" accept="image/*" multiple tabindex="-1" aria-hidden="true">
      <button type="button" class="up-drop" aria-describedby="up-drop-hint">
        <span class="up-drop-icon" aria-hidden="true">📷</span>
        <span class="up-drop-title">Add food photos</span>
        <span id="up-drop-hint" class="up-drop-hint muted">Tap to choose from your camera roll, or drag photos here</span>
      </button>

      <div class="up-status" role="status" aria-live="polite">
        <div class="up-progress" hidden>
          <span class="up-progress-text"></span>
          <span class="up-progress-bar"><span class="up-progress-fill"></span></span>
        </div>
        <p class="up-skipped" hidden></p>
      </div>

      <div class="up-grid-head">
        <h2 class="up-count"></h2>
        <button type="button" class="btn btn-ghost up-reset">Start over</button>
      </div>
      <ul class="up-grid" aria-label="Uploaded photos"></ul>

      <div class="actions no-print">
        <button type="button" class="btn btn-primary up-next">Next: rank them →</button>
      </div>
    </section>
  `;

  const $ = (sel) => container.querySelector(sel);
  const nameInput = $('#up-trip-name');
  const authorInput = $('#up-author');
  const fileInput = $('#up-file');
  const drop = $('.up-drop');
  const progress = $('.up-progress');
  const progressText = $('.up-progress-text');
  const progressFill = $('.up-progress-fill');
  const skippedEl = $('.up-skipped');
  const grid = $('.up-grid');
  const countEl = $('.up-count');
  const resetBtn = $('.up-reset');
  const nextBtn = $('.up-next');

  let alive = true;
  let busy = false;

  // --- Trip fields -------------------------------------------------------
  nameInput.addEventListener('input', () => {
    const name = nameInput.value;
    updateTrip((t) => ({ ...t, name }));
  });
  authorInput.addEventListener('input', () => {
    const author = authorInput.value;
    updateTrip((t) => ({ ...t, author }));
  });

  // --- Grid --------------------------------------------------------------
  function renderGrid(t = getTrip()) {
    const dishes = t.dishes || [];
    const n = dishes.length;
    countEl.textContent = n === 0 ? 'No photos yet' : `${n} photo${n === 1 ? '' : 's'}`;
    resetBtn.hidden = n === 0;
    nextBtn.disabled = n === 0;
    grid.innerHTML = dishes.map((d, i) => `
      <li class="up-thumb" data-id="${escapeHtml(d.id)}">
        <img src="${escapeHtml(d.image)}" alt="${escapeHtml(d.title || `Photo ${i + 1}`)}" loading="lazy" decoding="async">
        <button type="button" class="up-remove" data-id="${escapeHtml(d.id)}"
          aria-label="Remove ${escapeHtml(d.title || `photo ${i + 1}`)}">×</button>
      </li>
    `).join('');
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.up-remove');
    if (!btn) return;
    const id = btn.dataset.id;
    // Keep focus somewhere sensible after the button disappears.
    const next = btn.closest('.up-thumb')?.nextElementSibling || btn.closest('.up-thumb')?.previousElementSibling;
    const nextId = next?.dataset.id;
    updateTrip((t) => ({ ...t, dishes: t.dishes.filter((d) => d.id !== id) }));
    const target = nextId && grid.querySelector(`.up-remove[data-id="${CSS.escape(nextId)}"]`);
    (target || drop).focus();
  });

  resetBtn.addEventListener('click', () => {
    if (!confirm('Remove all photos and start over?')) return;
    updateTrip((t) => ({ ...t, dishes: [] }));
    drop.focus();
  });

  nextBtn.addEventListener('click', () => {
    if (getTrip().dishes.length > 0) location.hash = 'rank';
  });

  // --- File picking ------------------------------------------------------
  drop.addEventListener('click', () => {
    if (!busy) fileInput.click();
  });
  fileInput.addEventListener('change', () => {
    const files = Array.from(fileInput.files || []);
    fileInput.value = '';
    handleFiles(files);
  });

  // Drag and drop (desktop)
  let dragDepth = 0;
  const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
  drop.addEventListener('dragenter', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    dragDepth++;
    drop.classList.add('up-drop--over');
  });
  drop.addEventListener('dragover', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  drop.addEventListener('dragleave', () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) drop.classList.remove('up-drop--over');
  });
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDepth = 0;
    drop.classList.remove('up-drop--over');
    handleFiles(Array.from(e.dataTransfer?.files || []));
  });

  // Stop a near-miss drop from navigating the browser away to the image.
  const preventWindowDrop = (e) => {
    if (hasFiles(e)) e.preventDefault();
  };
  window.addEventListener('dragover', preventWindowDrop);
  window.addEventListener('drop', preventWindowDrop);

  async function handleFiles(files) {
    const candidates = files.filter(looksLikeImage);
    const rejected = files.filter((f) => !looksLikeImage(f)).map((f) => f.name);
    if (candidates.length === 0) {
      showSkipped(rejected);
      return;
    }
    busy = true;
    drop.setAttribute('aria-disabled', 'true');
    drop.classList.add('up-drop--busy');
    progress.hidden = false;
    const skipped = [...rejected];

    for (let i = 0; i < candidates.length; i++) {
      if (!alive) return;
      const file = candidates[i];
      progressText.textContent = `Processing ${i + 1} of ${candidates.length}…`;
      progressFill.style.width = `${(i / candidates.length) * 100}%`;
      try {
        const image = await downscale(file);
        if (!alive) return;
        updateTrip((t) => ({
          ...t,
          dishes: [...t.dishes, { id: newId(), image, title: '', note: '', place: null }],
        }));
      } catch (err) {
        console.warn('Skipped', file.name, err);
        skipped.push(file.name || 'Unnamed file');
      }
      // Let the UI breathe between files.
      await new Promise((r) => setTimeout(r, 0));
    }

    if (!alive) return;
    progressFill.style.width = '100%';
    progress.hidden = true;
    busy = false;
    drop.removeAttribute('aria-disabled');
    drop.classList.remove('up-drop--busy');
    showSkipped(skipped);
  }

  function showSkipped(names) {
    if (!names.length) {
      skippedEl.hidden = true;
      skippedEl.textContent = '';
      return;
    }
    const list = names.join(', ');
    skippedEl.textContent = `Couldn't read ${names.length === 1 ? 'this file' : `${names.length} files`}: ${list}. ` +
      'HEIC photos may not open in this browser. Try exporting them as JPEG.';
    skippedEl.hidden = false;
  }

  renderGrid(trip);
  const unsubscribe = subscribe((t) => renderGrid(t));

  return () => {
    alive = false;
    unsubscribe();
    window.removeEventListener('dragover', preventWindowDrop);
    window.removeEventListener('drop', preventWindowDrop);
  };
}

// --- Image helpers ---------------------------------------------------------

function looksLikeImage(file) {
  if (file.type && file.type.startsWith('image/')) return true;
  // Some platforms report HEIC (and others) with an empty type.
  return !file.type && /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp)$/i.test(file.name || '');
}

async function decode(file) {
  if ('createImageBitmap' in window) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close?.() };
    } catch {
      // Fall through to <img>, which also applies EXIF orientation in modern browsers.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
    if (!img.naturalWidth || !img.naturalHeight) throw new Error('Empty image');
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      done: () => URL.revokeObjectURL(url),
    };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

async function downscale(file) {
  const { source, width, height, done } = await decode(file);
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // JPEG has no alpha; avoid black backgrounds on PNGs.
    ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, w, h);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    if (!dataUrl.startsWith('data:image/jpeg')) throw new Error('Encoding failed');
    return dataUrl;
  } finally {
    done();
  }
}
