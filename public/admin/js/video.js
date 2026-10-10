// Turns a file the admin picked into something a website visitor can actually
// play, then uploads it in parts.
//
// Phone videos are big (a 20-second clip can be 40 MB) and are sometimes in
// formats browsers refuse. So: check the browser can play it, make a cover
// image from a frame, shrink it when it is heavy, and only then upload.
import { api } from './api.js';

const DIRECT_LIMIT = 10 * 1024 * 1024; // upload untouched below this
const MAX_UPLOAD = 64 * 1024 * 1024;
const TARGET_EDGE = 720; // long edge after shrinking
const TARGET_BITS = 1_400_000;

const fmtMb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;

function loadVideo(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;
    const fail = () => { URL.revokeObjectURL(url); reject(new Error('This video cannot be played in the browser. Please export or save it as MP4 and try again.')); };
    v.onerror = fail;
    v.onloadedmetadata = () => {
      if (!v.videoWidth || !v.duration || !Number.isFinite(v.duration)) return fail();
      resolve({ video: v, url });
    };
    v.src = url;
    v.load();
    setTimeout(() => { if (!v.videoWidth) fail(); }, 15000);
  });
}

function seek(video, time) {
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.1));
  });
}

// A still from the video, used as the cover image and as the poster the
// visitor sees before pressing play. Seeking alone is not enough: the frame
// has to be decoded, or the canvas comes out black. Several moments are tried
// so a fade-in at the start never becomes the cover.
function decodedFrame(video) {
  return new Promise((resolve) => {
    if (video.requestVideoFrameCallback) {
      let settled = false;
      video.requestVideoFrameCallback(() => { settled = true; resolve(); });
      setTimeout(() => { if (!settled) resolve(); }, 600);
    } else {
      setTimeout(resolve, 250);
    }
  });
}

function meanBrightness(ctx, w, h) {
  const { data } = ctx.getImageData(0, 0, w, h);
  let sum = 0;
  const step = Math.max(4, Math.floor(data.length / 4 / 2000) * 4);
  let n = 0;
  for (let i = 0; i < data.length; i += step) { sum += (data[i] + data[i + 1] + data[i + 2]) / 3; n += 1; }
  return n ? sum / n : 0;
}

async function coverFrame(video) {
  const scale = Math.min(1, 1200 / Math.max(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale);
  canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  const moments = [0.25, 0.5, 0.1, 0.75].map((f) => video.duration * f);
  for (const time of moments) {
    // eslint-disable-next-line no-await-in-loop
    await seek(video, time);
    // eslint-disable-next-line no-await-in-loop
    await decodedFrame(video);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (meanBrightness(ctx, canvas.width, canvas.height) > 14) break; // not a black frame
  }

  let blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.84));
  if (!blob || blob.type !== 'image/webp') blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.86));
  return { blob, w: canvas.width, h: canvas.height };
}

function pickRecorderType() {
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || null;
}

// Re-records the video through a canvas at a smaller size and bitrate. It runs
// in real time (a 30-second video takes 30 seconds) and is only used for files
// that would be slow for visitors to load.
async function shrinkVideo(file, video, onProgress) {
  const mimeType = pickRecorderType();
  if (!mimeType || !(video.captureStream || video.mozCaptureStream)) return null;

  const scale = Math.min(1, TARGET_EDGE / Math.min(video.videoWidth, video.videoHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(video.videoWidth * scale / 2) * 2;
  canvas.height = Math.round(video.videoHeight * scale / 2) * 2;
  const ctx = canvas.getContext('2d', { alpha: false });

  const canvasStream = canvas.captureStream(30);
  let sound = false;
  try {
    const src = (video.captureStream || video.mozCaptureStream).call(video);
    const audio = src.getAudioTracks()[0];
    if (audio) { canvasStream.addTrack(audio); sound = true; }
  } catch { /* some browsers cannot hand over the sound; the picture still works */ }

  const recorder = new MediaRecorder(canvasStream, { mimeType, videoBitsPerSecond: TARGET_BITS, audioBitsPerSecond: 96000 });
  const chunks = [];
  recorder.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };

  await seek(video, 0);
  video.muted = !sound;
  video.volume = sound ? 0.0001 : 0;
  const stopped = new Promise((resolve) => { recorder.onstop = resolve; });
  recorder.start(1000);
  await video.play();

  let raf = 0;
  const draw = () => { ctx.drawImage(video, 0, 0, canvas.width, canvas.height); raf = requestAnimationFrame(draw); };
  draw();
  await new Promise((resolve) => {
    const tick = () => { onProgress(Math.min(0.99, video.currentTime / video.duration)); };
    const timer = setInterval(tick, 250);
    video.onended = () => { clearInterval(timer); resolve(); };
  });
  cancelAnimationFrame(raf);
  recorder.stop();
  await stopped;
  canvasStream.getTracks().forEach((t) => t.stop());

  const type = mimeType.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
  const blob = new Blob(chunks, { type });
  // Keep whichever is smaller; re-recording a short clip can come out bigger.
  if (!blob.size || blob.size >= file.size) return null;
  return { blob, sound, width: canvas.width, height: canvas.height };
}

async function uploadParts(blob, mime, meta, onProgress) {
  const start = await api('/media/video', { method: 'POST', body: { mime, size: blob.size, ...meta } });
  const { id, partSize } = start;
  const total = Math.ceil(blob.size / partSize);
  for (let i = 0; i < total; i += 1) {
    const part = blob.slice(i * partSize, (i + 1) * partSize);
    // eslint-disable-next-line no-await-in-loop
    await api(`/media/video/${id}?part=${i}`, { method: 'PUT', body: await part.arrayBuffer(), headers: { 'content-type': 'application/octet-stream' } });
    onProgress((i + 1) / total);
  }
  return id;
}

/**
 * Prepares and uploads one video file.
 * onStatus({ phase, progress, note }) drives the progress bar.
 * Returns the finished media row.
 */
export async function uploadVideo(file, onStatus = () => {}) {
  if (!file.type.startsWith('video/')) throw new Error('Choose a video file.');
  if (file.size > MAX_UPLOAD * 2) throw new Error(`That video is ${fmtMb(file.size)}. Please trim it or export a smaller version.`);

  onStatus({ phase: 'reading', progress: 0, note: 'Reading the video…' });
  const { video, url } = await loadVideo(file);
  try {
    const cover = await coverFrame(video);
    const poster = await api('/media', {
      method: 'POST',
      body: cover.blob,
      headers: { 'content-type': cover.blob.type, 'x-width': String(cover.w), 'x-height': String(cover.h) },
    });

    let blob = file;
    let mime = file.type === 'video/webm' ? 'video/webm' : 'video/mp4';
    let width = video.videoWidth;
    let height = video.videoHeight;
    let note = '';

    const needsShrink = file.size > DIRECT_LIMIT || !/^video\/(mp4|webm)$/.test(file.type);
    if (needsShrink) {
      onStatus({ phase: 'shrink', progress: 0, note: 'Making the video smaller so the website stays fast…' });
      const smaller = await shrinkVideo(file, video, (p) => onStatus({ phase: 'shrink', progress: p, note: 'Making the video smaller so the website stays fast…' }));
      if (smaller) {
        blob = smaller.blob;
        mime = smaller.blob.type.startsWith('video/mp4') ? 'video/mp4' : 'video/webm';
        width = smaller.width;
        height = smaller.height;
        note = smaller.sound ? `Compressed to ${fmtMb(blob.size)}` : `Compressed to ${fmtMb(blob.size)} (without sound)`;
      } else if (!/^video\/(mp4|webm)$/.test(file.type)) {
        throw new Error('This video format cannot be shown on websites. Please export it as MP4 and try again.');
      }
    }

    if (blob.size > MAX_UPLOAD) throw new Error(`The video is still ${fmtMb(blob.size)}. Please trim it to about 30 seconds and try again.`);

    onStatus({ phase: 'upload', progress: 0, note: `Uploading ${fmtMb(blob.size)}…` });
    const id = await uploadParts(blob, mime, { width, height, duration: video.duration, title: file.name.replace(/\.[^.]+$/, '').slice(0, 120) },
      (p) => onStatus({ phase: 'upload', progress: p, note: `Uploading ${fmtMb(blob.size)}…` }));

    await api(`/media/video/${id}/complete`, { method: 'POST', body: { poster_id: poster.id } });
    onStatus({ phase: 'done', progress: 1, note });
    return { id, kind: 'video', poster_id: poster.id, duration: video.duration, width, height, mime, note };
  } finally {
    video.pause();
    video.removeAttribute('src');
    URL.revokeObjectURL(url);
  }
}
