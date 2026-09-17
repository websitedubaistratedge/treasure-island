import { api } from './api.js';
import { html, ico, mount, toast, errorToast } from './ui.js';

// Shrinks a photo in the browser before upload: long edge 1200px, WebP where
// the browser can encode it (JPEG otherwise). A 4 MB phone photo becomes a
// ~150 KB image, which keeps the database lean and the website fast.
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/.test(file.type) && !file.type.startsWith('image/')) {
    throw new Error('Choose an image file.');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const c2d = canvas.getContext('2d');
  c2d.fillStyle = '#ffffff';
  c2d.fillRect(0, 0, w, h);
  c2d.drawImage(bitmap, 0, 0, w, h);
  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.88));
  return { blob, w, h };
}

export function imagePicker(el, { current = null, onChange }) {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
  const draw = (src, busy = false) => mount(el, html`<div class="dropzone ${busy ? 'over' : ''}" tabindex="0" role="button" aria-label="Upload a photo">
    ${src ? html`<img src="${src}" alt="">` : html`<div class="empty-ico">${ico('image')}</div>`}
    <div><b>${busy ? 'Uploading…' : src ? 'Replace photo' : 'Add a photo'}</b><div class="help">Drop an image here or click. It is resized automatically.</div></div></div>`);
  draw(current);
  el.appendChild(input);
  const handle = async (file) => {
    if (!file) return;
    draw(current, true);
    el.appendChild(input);
    try {
      const { blob, w, h } = await shrink(file);
      const res = await api('/media', { method: 'POST', body: blob, headers: { 'content-type': blob.type, 'x-width': String(w), 'x-height': String(h) } });
      current = res.url;
      draw(current);
      el.appendChild(input);
      toast('Photo uploaded');
      onChange(res);
    } catch (err) {
      draw(current);
      el.appendChild(input);
      errorToast(err);
    }
  };
  el.addEventListener('click', (e) => { if (e.target.closest('.dropzone')) input.click(); });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.dropzone')) { e.preventDefault(); input.click(); } });
  input.addEventListener('change', () => handle(input.files[0]));
  el.addEventListener('dragover', (e) => { e.preventDefault(); const z = el.querySelector('.dropzone'); if (z) z.classList.add('over'); });
  el.addEventListener('dragleave', () => { const z = el.querySelector('.dropzone'); if (z) z.classList.remove('over'); });
  el.addEventListener('drop', (e) => { e.preventDefault(); handle(e.dataTransfer.files[0]); });
}

export const imageSrc = (row) => (row.image_id ? `/media/${row.image_id}` : row.image_url ? `/${row.image_url.replace(/^\/+/, '')}@400.webp` : null);
