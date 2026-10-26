// Hash router. Each screen module exports `render(container)` and may return
// a cleanup function that runs when the user leaves the screen.
import { loadTrip, getTrip, subscribe } from './state.js';
import * as upload from './upload.js';
import * as rank from './rank.js';
import * as summary from './summary.js';
import * as join from './join.js';

const screens = { upload, rank, summary, join };
const app = document.getElementById('app');
let cleanup = null;

// "#join=<id>" is a friend sending photos; the route name is before the "=".
const hashRoute = () => location.hash.slice(1).split('=')[0];

function currentRoute() {
  const name = hashRoute();
  if (!screens[name]) return 'upload';
  // Rank and summary need photos first.
  if (name !== 'upload' && name !== 'join' && getTrip().dishes.length === 0) return 'upload';
  return name;
}

function updateNav(route) {
  const hasDishes = getTrip().dishes.length > 0;
  document.querySelectorAll('.steps a').forEach((a) => {
    a.classList.toggle('active', a.dataset.step === route);
    a.classList.toggle('disabled', a.dataset.step !== 'upload' && !hasDishes);
  });
}

function show() {
  const route = currentRoute();
  if (hashRoute() !== route) history.replaceState(null, '', '#' + route);
  document.body.classList.toggle('route-join', route === 'join');
  if (typeof cleanup === 'function') cleanup();
  app.innerHTML = '';
  cleanup = screens[route].render(app);
  updateNav(route);
  window.scrollTo(0, 0);
}

export function go(route) {
  location.hash = route;
}

window.addEventListener('hashchange', show);
subscribe(() => updateNav(currentRoute()));

await loadTrip();
show();
