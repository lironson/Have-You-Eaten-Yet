// Shared trip state, persisted to IndexedDB so a reload keeps your photos.
//
// Trip shape:
// {
//   name: string,          // e.g. "Tokyo, Spring 2026"
//   author: string,        // optional "by" line
//   dishes: Dish[]         // array order IS the ranking (index 0 = #1)
// }
// Dish shape:
// {
//   id: string,
//   image: string,         // downscaled JPEG data URL
//   title: string,         // dish name, e.g. "Tonkotsu ramen"
//   note: string,          // optional one-liner tip
//   place: null | {
//     name: string,        // restaurant name
//     address: string,     // optional display address
//     mapsUrl: string,     // Google Maps link
//     website: string      // optional website
//   }
// }

const DB_NAME = 'hyey';
const STORE = 'trip';
const KEY = 'current';

const listeners = new Set();
let trip = { name: '', author: '', dishes: [] };

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persist() {
  try {
    const db = await openDb();
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(trip, KEY);
  } catch (err) {
    console.warn('Could not save trip', err);
  }
}

export async function loadTrip() {
  try {
    const db = await openDb();
    const saved = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (saved) trip = { name: '', author: '', dishes: [], ...saved };
  } catch (err) {
    console.warn('Could not load trip', err);
  }
  return trip;
}

export function getTrip() {
  return trip;
}

// Pass a function that mutates the trip (or returns a new one).
export function updateTrip(fn) {
  trip = fn(trip) || trip;
  persist();
  listeners.forEach((l) => l(trip));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function resetTrip() {
  updateTrip(() => ({ name: '', author: '', dishes: [] }));
}

export function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function mapsSearchUrl(query) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}

export function escapeHtml(s = '') {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
