// Shared image pipeline: decode a picked file (respecting EXIF orientation)
// and downscale it to a JPEG data URL. Used by the host and by guests.

const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

export function looksLikeImage(file) {
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

export async function downscale(file) {
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
