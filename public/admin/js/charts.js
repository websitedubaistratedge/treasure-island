import { html, raw, mount, aed, fmtDay } from './ui.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Smooth line through points (Catmull-Rom as cubic Béziers). Each control
// point is clamped between its segment's two end values, so the curve never
// overshoots: revenue can't dip below zero before a spike.
function smooth(pts) {
  if (pts.length < 2) return '';
  const clamp = (v, a, b) => Math.min(Math.max(v, Math.min(a, b)), Math.max(a, b));
  let d = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, clamp(p1[1] + (p2[1] - p0[1]) / 6, p1[1], p2[1])];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, clamp(p2[1] - (p3[1] - p1[1]) / 6, p1[1], p2[1])];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

function niceMax(v) {
  if (v <= 0) return 1000;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag / 2) * 2 * mag;
}

export function areaChart(el, series, { height = 260 } = {}) {
  const W = 720, H = height, L = 52, R = 12, T = 14, B = 30;
  const values = series.map((s) => s.fils / 100);
  const max = niceMax(Math.max(...values, 0));
  const x = (i) => L + (i * (W - L - R)) / Math.max(1, series.length - 1);
  const y = (v) => T + (H - T - B) * (1 - v / max);
  const pts = values.map((v, i) => [x(i), y(v)]);
  const line = smooth(pts);
  const area = `${line} L${x(series.length - 1)},${H - B} L${x(0)},${H - B} Z`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  const labelEvery = Math.ceil(series.length / 6);
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Revenue over the last ${series.length} days">
    <defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#FFBA1A" stop-opacity=".38"/><stop offset="1" stop-color="#FFBA1A" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${ticks.map((t) => `<line x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/>`).join('')}</g>
    <g class="axis">${ticks.map((t) => `<text x="${L - 10}" y="${y(t) + 4}" text-anchor="end">${t >= 1000 ? `${(t / 1000).toFixed(t % 1000 ? 1 : 0)}k` : Math.round(t)}</text>`).join('')}
      ${series.map((s, i) => (i % labelEvery === 0 || i === series.length - 1) ? `<text x="${x(i)}" y="${H - 8}" text-anchor="middle">${esc(s.day.slice(8))}/${esc(s.day.slice(5, 7))}</text>` : '').join('')}</g>
    <path d="${area}" fill="url(#ga)"/>
    <path d="${line}" fill="none" stroke="#F5A50A" stroke-width="2.6" stroke-linecap="round"/>
    <line class="hover-line" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="currentColor" stroke-opacity=".18" stroke-dasharray="4 4" visibility="hidden"/>
    <circle class="hover-dot" r="5" fill="#fff" stroke="#F5A50A" stroke-width="3" visibility="hidden"/>
    <rect x="${L}" y="${T}" width="${W - L - R}" height="${H - T - B}" fill="transparent" class="hit"/>
  </svg>`;
  mount(el, html`<div class="chart">${raw(svg)}<div class="chart-tip"></div></div>`);
  const svgEl = el.querySelector('svg');
  const tip = el.querySelector('.chart-tip');
  const hl = el.querySelector('.hover-line');
  const dot = el.querySelector('.hover-dot');
  const move = (clientX) => {
    const rect = svgEl.getBoundingClientRect();
    const vx = ((clientX - rect.left) / rect.width) * W;
    const i = Math.max(0, Math.min(series.length - 1, Math.round(((vx - L) / (W - L - R)) * (series.length - 1))));
    const [px, py] = pts[i];
    hl.setAttribute('x1', px); hl.setAttribute('x2', px); hl.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', px); dot.setAttribute('cy', py); dot.setAttribute('visibility', 'visible');
    mount(tip, html`<b>${aed(series[i].fils)}</b>${fmtDay(`${series[i].day}T08:00:00Z`)} · ${series[i].orders} order${series[i].orders === 1 ? '' : 's'}`);
    tip.style.left = `${(px / W) * 100}%`;
    tip.style.top = `${(py / H) * 100}%`;
    tip.classList.add('show');
  };
  const hide = () => { tip.classList.remove('show'); hl.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); };
  svgEl.addEventListener('pointermove', (e) => move(e.clientX));
  svgEl.addEventListener('pointerleave', hide);
}

export function sparkline(values, color = '#F5A50A') {
  const W = 120, H = 40;
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => [(i * W) / Math.max(1, values.length - 1), H - 4 - (v / max) * (H - 8)]);
  const d = smooth(pts);
  return raw(`<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d} L${W},${H} L0,${H} Z" fill="${color}" fill-opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/></svg>`);
}

export function donut(segments, { size = 150, thickness = 22 } = {}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const arcs = segments.map((s) => {
    const len = (s.value / total) * c;
    const arc = `<circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="${s.color}" stroke-width="${thickness}"
      stroke-dasharray="${Math.max(0, len - 2)} ${c}" stroke-dashoffset="${-offset}" transform="rotate(-90 ${size / 2} ${size / 2})"/>`;
    offset += len;
    return arc;
  }).join('');
  return raw(`<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" aria-hidden="true">
    <circle r="${r}" cx="${size / 2}" cy="${size / 2}" fill="none" stroke="currentColor" stroke-opacity=".07" stroke-width="${thickness}"/>${arcs}</svg>`);
}
