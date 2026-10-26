// Lazy loaders for vendored libraries, so they only download when used.
const scripts = new Map();

export function loadScript(src) {
  if (!scripts.has(src)) {
    scripts.set(src, new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => { scripts.delete(src); reject(new Error(`Could not load ${src}`)); };
      document.head.appendChild(el);
    }));
  }
  return scripts.get(src);
}

export function loadStyle(href) {
  if (!document.querySelector(`link[href="${href}"]`)) {
    const el = document.createElement('link');
    el.rel = 'stylesheet';
    el.href = href;
    document.head.appendChild(el);
  }
}
