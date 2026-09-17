import { api } from '../api.js';
import { html, ico, mount, $, fmtDate, fmtTime, toast, raw } from '../ui.js';

// Front-desk check-in. Staff type a pass code or scan the QR from the
// customer's order page. Camera scanning uses the browser's built-in
// BarcodeDetector where available (Chrome/Edge/Android); typing always works.
export default async function checkin(root, ctx) {
  ctx.setCrumbs([{ label: 'Check-in' }]);
  const canScan = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  const recent = [];
  let stream = null;
  let scanning = false;

  mount(root, html`
  <div class="page-head"><div><h1>Check-in</h1><p>Scan or type a pass code to use one visit.</p></div></div>
  <div class="layout-2">
    <div class="stack">
      <form class="card card-pad form" data-form novalidate>
        <div class="field"><label for="code">Pass code</label>
          <div class="row"><div class="input-group grow">${ico('ticket')}<input class="input mono" id="code" name="code" placeholder="PASS-XXXX-XXXX" autocomplete="off" autocapitalize="characters" spellcheck="false"></div>
          <button class="btn btn-primary" type="submit">${ico('check')} Check in</button></div></div>
        ${canScan ? html`<button type="button" class="btn btn-ghost" data-scan>${ico('camera')} Scan QR with camera</button>` : html`<div class="help">Camera scanning works in Chrome and Edge. You can always type the code.</div>`}
        <div class="scan" data-cam hidden><video playsinline muted></video></div>
      </form>
      <div data-result></div>
    </div>
    <div class="card"><div class="card-head"><div class="h2">This session</div><span class="sub" data-count>0 check-ins</span></div><div data-recent>
      <div class="empty"><div class="empty-ico">${ico('scan')}</div><b>No check-ins yet</b></div></div></div>
  </div>`);

  const input = $('#code', root);
  const out = $('[data-result]', root);
  setTimeout(() => input.focus(), 60);

  async function submit(code) {
    code = String(code || '').trim().toUpperCase();
    if (!code) return;
    try {
      const { row: p } = await api('/passes/checkin', { method: 'POST', body: { code } });
      const left = p.visits_total - p.visits_used;
      const kids = JSON.parse(p.children || '[]');
      mount(out, html`<div class="result ok">
        <div class="empty-ico tone-leaf">${ico('check')}</div>
        <div class="big">Welcome, ${p.holder_name.split(' ')[0]}!</div>
        ${kids.length ? html`<div>${kids.map((c) => c.name).join(', ')}</div>` : ''}
        <div class="h2 nums">${left} visit${left === 1 ? '' : 's'} left of ${p.visits_total}</div>
        <div class="sub">${p.name}${p.expires_at ? ` · valid until ${fmtDate(p.expires_at)}` : ''}</div>
        ${left === 0 ? html`<div class="callout warn">${ico('alert')}<div>That was the last visit on this pass.</div></div>` : ''}</div>`);
      recent.unshift({ ok: true, code, name: p.holder_name, left, at: new Date().toISOString() });
      if (navigator.vibrate) navigator.vibrate(60);
    } catch (err) {
      const p = err.data && err.data.pass;
      mount(out, html`<div class="result bad">
        <div class="empty-ico tone-coral">${ico('x')}</div>
        <div class="big">Not checked in</div><div class="h2">${err.message}</div>
        ${p ? html`<div class="sub">${p.holder_name} · ${p.visits_used}/${p.visits_total} used${p.expires_at ? ` · expires ${fmtDate(p.expires_at)}` : ''}</div>
          <a class="btn btn-ghost btn-sm" href="#/passes?open=${p.id}">Open pass</a>` : ''}</div>`);
      recent.unshift({ ok: false, code, name: p ? p.holder_name : '', reason: err.message, at: new Date().toISOString() });
      if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    }
    input.value = '';
    input.focus();
    $('[data-count]', root).textContent = `${recent.filter((r) => r.ok).length} check-in${recent.filter((r) => r.ok).length === 1 ? '' : 's'}`;
    mount($('[data-recent]', root), html`<div class="list">${recent.slice(0, 30).map((r) => html`<div class="list-row">
      <span class="kpi-ico ${r.ok ? 'tone-leaf' : 'tone-coral'}">${ico(r.ok ? 'check' : 'x')}</span>
      <div class="grow"><div class="cell-main">${r.name || r.code}</div><div class="cell-sub mono">${r.code}</div></div>
      <div class="right"><div class="cell-main">${r.ok ? `${r.left} left` : 'Refused'}</div><div class="cell-sub">${fmtTime(r.at)}</div></div></div>`)}</div>`);
  }

  $('[data-form]', root).addEventListener('submit', (e) => { e.preventDefault(); submit(input.value); });

  async function stopScan() {
    scanning = false;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
    const cam = $('[data-cam]', root);
    if (cam) cam.hidden = true;
  }
  const scanBtn = $('[data-scan]', root);
  if (scanBtn) scanBtn.addEventListener('click', async () => {
    if (scanning) { stopScan(); scanBtn.lastChild.textContent = ' Scan QR with camera'; return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch { toast('Camera permission was not granted.', 'bad'); return; }
    const cam = $('[data-cam]', root);
    const video = cam.querySelector('video');
    cam.hidden = false;
    video.srcObject = stream;
    await video.play();
    scanning = true;
    scanBtn.lastChild.textContent = ' Stop camera';
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
    let last = '';
    const tick = async () => {
      if (!scanning || !document.body.contains(video)) { stopScan(); return; }
      try {
        const codes = await detector.detect(video);
        const value = codes[0] && codes[0].rawValue;
        const match = value && value.toUpperCase().match(/PASS-[A-Z2-9]{4}-[A-Z2-9]{4}/);
        if (match && match[0] !== last) { last = match[0]; await submit(match[0]); setTimeout(() => { last = ''; }, 4000); }
      } catch { /* frame not ready */ }
      setTimeout(tick, 250);
    };
    tick();
  });
  window.addEventListener('hashchange', stopScan, { once: true });
}
