// "Can't decide?" tournament. A 1v1 knockout picks the top 4 (final + 3rd
// place match); everyone else is ordered by the round they went out in.
// Byes go to the current top of the list. Opens as a full-screen overlay.
import { escapeHtml } from './state.js';

const roundName = (size) =>
  size === 2 ? 'Final' : size === 4 ? 'Semifinal' : size === 8 ? 'Quarterfinal' : `Round of ${size}`;

// Returns a function that closes the overlay without applying anything.
export function openBracket(dishes, onApply) {
  const ids = dishes.map((d) => d.id);
  const seed = new Map(ids.map((id, i) => [id, i]));
  const byId = new Map(dishes.map((d) => [d.id, d]));
  const totalMatches = ids.length - 1 + (ids.length >= 4 ? 1 : 0);
  const opener = document.activeElement;

  // Whole tournament is plain data, so undo is a stack of snapshots.
  let s;
  let history;
  reset();

  const el = document.createElement('div');
  el.className = 'br';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', 'Tournament bracket');
  document.body.appendChild(el);
  document.body.classList.add('br-open');
  el.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  draw();

  function reset() {
    s = { phase: 'main', round: 0, size: 0, advance: [], pairs: [], match: 0, winners: [], elim: {}, semiLosers: [], champion: null, runnerUp: null, third: null, played: 0 };
    history = [];
    startRound(ids);
  }

  function startRound(entrants) {
    let size = 1;
    while (size < entrants.length) size *= 2;
    const byes = size - entrants.length;
    const rest = entrants.slice(byes);
    s.round += 1;
    s.size = size;
    s.advance = entrants.slice(0, byes);
    s.winners = [];
    s.match = 0;
    // Best remaining seed meets worst remaining seed.
    s.pairs = [];
    for (let i = 0; i < rest.length / 2; i++) s.pairs.push([rest[i], rest[rest.length - 1 - i]]);
  }

  function finishRound() {
    const next = [...s.advance, ...s.winners];
    if (next.length > 1) return startRound(next);
    s.champion = next[0];
    if (s.semiLosers.length === 2) {
      s.phase = 'third';
      s.pairs = [s.semiLosers.slice()];
      s.match = 0;
    } else {
      s.phase = 'done';
    }
  }

  function pick(side) {
    if (s.phase === 'done') return;
    history.push(structuredClone(s));
    const [a, b] = s.pairs[s.match];
    const [winner, loser] = side === 0 ? [a, b] : [b, a];
    s.played += 1;
    if (s.phase === 'third') {
      s.third = [winner, loser];
      s.phase = 'done';
    } else {
      s.elim[loser] = s.round;
      if (s.size === 4) s.semiLosers.push(loser);
      if (s.size === 2) s.runnerUp = loser;
      s.winners.push(winner);
      s.match += 1;
      if (s.match === s.pairs.length) finishRound();
    }
    draw();
  }

  function undo() {
    if (!history.length) return;
    s = history.pop();
    draw();
  }

  function ranking() {
    const top = [s.champion, s.runnerUp, ...(s.third || s.semiLosers)].filter(Boolean);
    const placed = new Set(top);
    const rest = ids
      .filter((id) => !placed.has(id))
      .sort((a, b) => (s.elim[b] - s.elim[a]) || (seed.get(a) - seed.get(b)));
    return [...top, ...rest];
  }

  function nameOf(id) {
    return byId.get(id).title || `Photo ${seed.get(id) + 1}`;
  }

  function topBar() {
    return `
      <div class="br-bar">
        <button type="button" class="btn btn-ghost br-bar-btn" data-act="close">✕ Close</button>
        <button type="button" class="btn btn-ghost br-bar-btn" data-act="undo" ${history.length ? '' : 'disabled'}>↶ Undo</button>
      </div>
      <div class="br-progress" aria-hidden="true"><span style="width:${(s.played / totalMatches) * 100}%"></span></div>`;
  }

  function pickHtml(id, side) {
    const d = byId.get(id);
    return `
      <button type="button" class="br-pick" data-side="${side}" aria-label="${escapeHtml(nameOf(id))}${side === 0 ? ' (left arrow)' : ' (right arrow)'}">
        <img src="${escapeHtml(d.image || '')}" alt="" draggable="false">
        <span class="br-pick-name">${escapeHtml(nameOf(id))}</span>
        ${d.place ? `<span class="br-pick-place muted">${escapeHtml(d.place.name)}</span>` : ''}
      </button>`;
  }

  function draw() {
    if (s.phase === 'done') return drawResult();
    const [a, b] = s.pairs[s.match];
    const label = s.phase === 'third'
      ? '3rd place match'
      : `${roundName(s.size)}${s.pairs.length > 1 ? ` · Match ${s.match + 1} of ${s.pairs.length}` : ''}`;
    el.innerHTML = `
      <div class="br-inner">
        ${topBar()}
        <p class="br-round">${label}</p>
        <h2 class="br-q">Which was better?</h2>
        <div class="br-vs">
          ${pickHtml(a, 0)}
          <span class="br-vs-label" aria-hidden="true">vs</span>
          ${pickHtml(b, 1)}
        </div>
        <p class="br-count muted">${totalMatches - s.played} ${totalMatches - s.played === 1 ? 'pick' : 'picks'} to go</p>
      </div>`;
    el.querySelector('.br-pick').focus({ preventScroll: true });
  }

  function drawResult() {
    const order = ranking();
    const top = order.slice(0, 4);
    const rest = order.slice(4);
    el.innerHTML = `
      <div class="br-inner">
        ${topBar()}
        <p class="br-round">Tournament complete</p>
        <h2 class="br-q">Your top ${top.length}</h2>
        <ol class="br-top">
          ${top.map((id, i) => `
            <li class="br-top-item">
              <span class="br-medal br-medal--${i + 1}">${i + 1}</span>
              <img src="${escapeHtml(byId.get(id).image || '')}" alt="">
              <span class="br-top-name">${escapeHtml(nameOf(id))}</span>
            </li>`).join('')}
        </ol>
        ${rest.length ? `
          <h3 class="br-rest-h">The rest</h3>
          <ol class="br-rest" start="5">
            ${rest.map((id) => `<li>${escapeHtml(nameOf(id))}</li>`).join('')}
          </ol>` : ''}
        <div class="actions">
          <button type="button" class="btn" data-act="restart">Start over</button>
          <button type="button" class="btn btn-primary" data-act="apply">Use this ranking</button>
        </div>
      </div>`;
    el.querySelector('[data-act="apply"]').focus({ preventScroll: true });
  }

  function onClick(e) {
    const p = e.target.closest('.br-pick');
    if (p) return pick(Number(p.dataset.side));
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'undo') undo();
    else if (act === 'restart') { reset(); draw(); }
    else if (act === 'close') requestClose();
    else if (act === 'apply') { const order = ranking(); close(); onApply(order); }
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); requestClose(); }
    else if (s.phase !== 'done' && e.key === 'ArrowLeft') pick(0);
    else if (s.phase !== 'done' && e.key === 'ArrowRight') pick(1);
  }

  function requestClose() {
    if (s.played > 0 && s.phase !== 'done' && !confirm('Quit the tournament? Your picks will be lost.')) return;
    close();
  }

  function close() {
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('br-open');
    el.remove();
    if (opener && document.contains(opener)) opener.focus({ preventScroll: true });
  }

  return close;
}
