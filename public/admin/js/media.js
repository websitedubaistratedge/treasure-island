import { api } from './api.js';
import { html, ico, mount, toast, errorToast, raw, $ } from './ui.js';
import { uploadVideo } from './video.js';

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

export const mediaThumb = (m) => (m.kind === 'video' ? (m.poster_id ? `/media/${m.poster_id}` : null) : `/media/${m.id}`);

const clock = (s) => {
  if (!s && s !== 0) return '';
  const t = Math.round(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
};

/**
 * The photos-and-videos strip used when adding or editing a programme or a
 * product. It keeps its own list and hands the new order back on every change;
 * the form saves that list together with the rest of the fields.
 */
export function galleryEditor(el, { items = [], onChange = () => {}, canEdit = true } = {}) {
  let list = items.slice();
  let busyNote = null;
  const fileInput = (accept) => Object.assign(document.createElement('input'), { type: 'file', accept, hidden: true });
  const photoInput = fileInput('image/*');
  const videoInput = fileInput('video/*');

  const setBar = (p) => { const bar = $('[data-bar]', el); if (bar) bar.style.width = `${Math.round((p || 0) * 100)}%`; };
  const draw = () => {
    mount(el, html`<div class="gallery">
      <div class="row-between">
        <div class="eyebrow">Photos &amp; videos</div>
        ${canEdit ? html`<div class="gallery-actions">
          <button type="button" class="btn btn-quiet btn-sm" data-add-photo>${ico('image')} Add photo</button>
          <button type="button" class="btn btn-quiet btn-sm" data-add-video>${ico('play')} Add video</button>
        </div>` : ''}
      </div>
      ${busyNote ? html`<div class="gallery-progress"><div class="bar"><span data-bar></span></div><div class="help">${busyNote.note}</div></div>` : ''}
      ${list.length ? html`<ul class="gallery-grid">${list.map((m, i) => html`<li class="gallery-item ${m.kind === 'video' ? 'is-video' : ''}">
          <div class="gallery-thumb">${mediaThumb(m) ? html`<img src="${mediaThumb(m)}" alt="">` : html`<span class="empty-ico">${ico(m.kind === 'video' ? 'play' : 'image')}</span>`}
            ${m.kind === 'video' ? html`<span class="gallery-badge">${ico('play')} ${clock(m.duration)}</span>` : ''}
            ${i === 0 ? html`<span class="gallery-main">Main</span>` : ''}</div>
          ${canEdit ? html`<div class="gallery-tools">
            <button type="button" class="icon-btn" data-up="${i}" ${i === 0 ? raw('disabled') : ''} aria-label="Move earlier">${ico('chevron-left')}</button>
            <button type="button" class="icon-btn" data-down="${i}" ${i === list.length - 1 ? raw('disabled') : ''} aria-label="Move later">${ico('chevron-right')}</button>
            <button type="button" class="icon-btn danger" data-remove="${i}" aria-label="Remove">${ico('trash')}</button>
          </div>` : ''}
        </li>`)}</ul>`
        : html`<div class="gallery-empty">${ico('image')}<div><b>No photos or videos yet</b><div class="help">The first photo is used as the main picture. A video is shown on the website with a play button.</div></div></div>`}
    </div>`);
    if (canEdit) { el.appendChild(photoInput); el.appendChild(videoInput); }
    if (busyNote) setBar(busyNote.progress);
  };

  const update = (next) => { list = next; draw(); onChange(list); };

  const addPhoto = async (file) => {
    if (!file) return;
    busyNote = { progress: 0, note: 'Uploading photo…' }; draw();
    try {
      const { blob, w, h } = await shrink(file);
      const res = await api('/media', { method: 'POST', body: blob, headers: { 'content-type': blob.type, 'x-width': String(w), 'x-height': String(h) } });
      busyNote = null;
      update(list.concat({ id: res.id, kind: 'image', width: w, height: h }));
      toast('Photo added');
    } catch (err) { busyNote = null; draw(); errorToast(err); }
  };

  const addVideo = async (file) => {
    if (!file) return;
    busyNote = { progress: 0, note: 'Reading the video…' }; draw();
    try {
      const row = await uploadVideo(file, (s) => {
        busyNote = { progress: s.progress, note: s.note };
        const bar = $('[data-bar]', el);
        const help = $('.gallery-progress .help', el);
        if (bar && help) { setBar(s.progress); help.textContent = s.note; } else draw();
      });
      busyNote = null;
      update(list.concat(row));
      toast(row.note ? `Video added · ${row.note}` : 'Video added');
    } catch (err) { busyNote = null; draw(); errorToast(err); }
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-add-photo]')) photoInput.click();
    if (e.target.closest('[data-add-video]')) videoInput.click();
    const up = e.target.closest('[data-up]');
    const down = e.target.closest('[data-down]');
    const rm = e.target.closest('[data-remove]');
    if (up) { const i = +up.dataset.up; const n = list.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; update(n); }
    if (down) { const i = +down.dataset.down; const n = list.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; update(n); }
    if (rm) { const n = list.slice(); n.splice(+rm.dataset.remove, 1); update(n); }
  });
  photoInput.addEventListener('change', () => { addPhoto(photoInput.files[0]); photoInput.value = ''; });
  videoInput.addEventListener('change', () => { addVideo(videoInput.files[0]); videoInput.value = ''; });
  el.addEventListener('dragover', (e) => { e.preventDefault(); });
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    if (file.type.startsWith('video/')) addVideo(file); else addPhoto(file);
  });

  draw();
  return { get items() { return list; }, set items(v) { list = v.slice(); draw(); } };
}
