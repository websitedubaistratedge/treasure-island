import { api } from '../api.js';
import { html, ico, mount, $, $$, aed, toAed, drawer, toast, errorToast, busy, values, showErrors, confirmDialog, badge, raw } from '../ui.js';
import { imagePicker, imageSrc } from '../media.js';

const FILTERS = [['all', 'All'], ['active', 'On the website'], ['hidden', 'Hidden'], ['low', 'Low stock']];

export default async function boutique(root, ctx) {
  ctx.setCrumbs([{ label: 'Boutique' }]);
  const manager = ctx.can('manager');
  let rows = [];
  let filter = 'all';

  const shown = () => rows.filter((p) => filter === 'all' || (filter === 'active' && p.active) || (filter === 'hidden' && !p.active) || (filter === 'low' && p.stock != null && p.stock <= 3));
  function draw() {
    const list = shown();
    mount(root, html`
    <div class="page-head">
      <div><h1>Boutique</h1><p>Products on the website. Drag to reorder; the first ones lead the homepage.</p></div>
      ${manager ? html`<div class="page-actions"><button class="btn btn-primary" data-new>${ico('plus')} Add product</button></div>` : ''}
    </div>
    <div class="row-between wrap">
      <div class="tabs">${FILTERS.map(([v, l]) => html`<button class="tab ${filter === v ? 'on' : ''}" data-filter="${v}">${l}<span class="n">${v === 'all' ? rows.length : rows.filter((p) => (v === 'active' && p.active) || (v === 'hidden' && !p.active) || (v === 'low' && p.stock != null && p.stock <= 3)).length}</span></button>`)}</div>
      <span class="sub">${rows.filter((p) => p.price_fils == null).length} without a price show “Ask for price”</span>
    </div><br>
    ${list.length ? html`<div class="tiles" data-tiles>${list.map((p) => {
      const img = imageSrc(p);
      return html`<div class="card tile ${p.active ? '' : 'off'}" data-id="${p.id}" ${manager && filter === 'all' ? raw('draggable="true"') : ''}>
        ${manager && filter === 'all' ? html`<span class="tile-handle" title="Drag to reorder">${ico('grip')}</span>` : ''}
        <div class="tile-flags">${p.featured ? html`<span class="badge b-warn">Homepage</span>` : ''}</div>
        <button class="tile-img" data-edit="${p.id}" aria-label="Edit ${p.name}">${img ? html`<img src="${img}" alt="" loading="lazy">` : ico('image')}</button>
        <div class="tile-body">
          <div class="tile-name">${p.name}</div>
          <div class="tile-meta"><b class="nums">${aed(p.price_fils)}</b>${p.stock == null ? html`<span class="sub">No stock limit</span>` : p.stock === 0 ? badge('void', 'Sold out') : p.stock <= 3 ? badge('pending', `${p.stock} left`) : html`<span class="sub">${p.stock} in stock</span>`}</div>
          <div class="row-between"><label class="switch"><input type="checkbox" data-flag="active" data-pid="${p.id}" ${p.active ? raw('checked') : ''}><span class="track"></span><span class="sub">Visible</span></label>
            ${p.sold ? html`<span class="sub">${p.sold} sold</span>` : ''}</div>
        </div></div>`;
    })}</div>` : html`<div class="card"><div class="empty"><div class="empty-ico">${ico('bag')}</div><b>Nothing here</b></div></div>`}`);
    if (manager && filter === 'all') wireDrag();
  }
  async function load() { rows = (await api('/products')).rows; if (ctx.isCurrent()) draw(); }

  function wireDrag() {
    const grid = $('[data-tiles]', root);
    if (!grid) return;
    let dragging = null;
    grid.addEventListener('dragstart', (e) => { dragging = e.target.closest('.tile'); if (dragging) { dragging.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
    grid.addEventListener('dragend', () => { if (dragging) dragging.classList.remove('dragging'); $$('.tile.drop', grid).forEach((t) => t.classList.remove('drop')); });
    grid.addEventListener('dragover', (e) => {
      e.preventDefault();
      const over = e.target.closest('.tile');
      $$('.tile.drop', grid).forEach((t) => t !== over && t.classList.remove('drop'));
      if (over && over !== dragging) over.classList.add('drop');
    });
    grid.addEventListener('drop', async (e) => {
      e.preventDefault();
      const over = e.target.closest('.tile');
      if (!over || !dragging || over === dragging) return;
      const tiles = $$('.tile', grid);
      const from = tiles.indexOf(dragging);
      const to = tiles.indexOf(over);
      grid.insertBefore(dragging, from < to ? over.nextSibling : over);
      const ids = $$('.tile', grid).map((t) => Number(t.dataset.id));
      try {
        await api('/products/reorder', { method: 'POST', body: { ids } });
        rows.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
        toast('Order saved. The website updates straight away.');
      } catch (err) { errorToast(err); load(); }
    });
  }

  function openEditor(p) {
    const row = p || { active: 1, featured: 1 };
    const d = drawer({ title: p ? p.name : 'Add product' });
    let imageId = row.image_id || null;
    mount(d.body, html`<form class="form" novalidate>
      <div data-image></div>
      <div class="field"><label>Name *</label><input class="input" name="name" value="${row.name || ''}" ${manager ? '' : raw('disabled')}></div>
      <div class="field"><label>Description</label><textarea class="textarea" name="description" rows="3" maxlength="600" ${manager ? '' : raw('disabled')}>${row.description || ''}</textarea></div>
      <div class="grid-2">
        <div class="field"><label>Price</label><div class="input-group has-suffix"><input class="input" name="price" type="number" step="0.01" min="0" value="${toAed(row.price_fils)}" placeholder="Ask for price" ${manager ? '' : raw('disabled')}><span class="suffix">AED</span></div><div class="help">Empty shows “Ask for price” with WhatsApp.</div></div>
        <div class="field"><label>Stock</label><input class="input" name="stock" type="number" min="0" value="${row.stock ?? ''}" placeholder="Not tracked"><div class="help">Goes down automatically when sold online.</div></div>
      </div>
      <label class="switch"><input type="checkbox" name="active" ${row.active ? raw('checked') : ''}><span class="track"></span><span><b>Visible on the website</b></span></label>
      <label class="switch"><input type="checkbox" name="featured" ${row.featured ? raw('checked') : ''} ${manager ? '' : raw('disabled')}><span class="track"></span><span><b>Show on the homepage</b><div class="help">Appears in the homepage boutique strip.</div></span></label>
    </form>`);
    if (manager) imagePicker($('[data-image]', d.body), { current: imageSrc(row), onChange: (m) => { imageId = m.id; } });
    d.setFoot(html`${p && manager ? html`<button class="btn btn-danger" data-del>${ico('trash')} Delete</button>` : ''}<div class="top-spacer"></div>
      <button class="btn btn-ghost" data-cancel>Cancel</button><button class="btn btn-primary" data-save>${ico('check')} Save</button>`);
    d.el.addEventListener('click', async (e) => {
      if (e.target.closest('[data-cancel]')) d.close();
      const save = e.target.closest('[data-save]');
      if (save) {
        const v = values($('form', d.body));
        const body = manager
          ? { name: v.name, description: v.description, price: v.price, stock: v.stock, active: v.active, featured: v.featured, ...(imageId !== row.image_id ? { image_id: imageId } : {}) }
          : { stock: v.stock, active: v.active };
        await busy(save, async () => {
          try { await api(p ? `/products/${p.id}` : '/products', { method: p ? 'PATCH' : 'POST', body }); toast(p ? 'Product saved' : 'Product added'); d.close(); load(); } catch (err) { showErrors(d.body, err); }
        });
      }
      if (e.target.closest('[data-del]')) {
        if (!(await confirmDialog({ title: `Delete ${p.name}?`, message: 'If it has been sold it is hidden instead, so order history stays intact.', confirm: 'Delete', danger: true }))) return;
        try { const r = await api(`/products/${p.id}`, { method: 'DELETE' }); toast(r.archived ? 'Hidden (it has sales)' : 'Deleted'); d.close(); load(); } catch (err) { errorToast(err); }
      }
    });
  }

  root.addEventListener('click', (e) => {
    const f = e.target.closest('[data-filter]');
    if (f) { filter = f.dataset.filter; draw(); }
    if (e.target.closest('[data-new]')) openEditor(null);
    const ed = e.target.closest('[data-edit]');
    if (ed) openEditor(rows.find((r) => r.id === Number(ed.dataset.edit)));
  });
  root.addEventListener('change', async (e) => {
    const t = e.target.closest('[data-flag]');
    if (!t) return;
    try { await api(`/products/${t.dataset.pid}`, { method: 'PATCH', body: { [t.dataset.flag]: t.checked } }); toast(t.checked ? 'Visible on the website' : 'Hidden from the website'); load(); } catch (err) { t.checked = !t.checked; errorToast(err); }
  });
  await load();
  if (ctx.query.get('new') && manager) openEditor(null);
}
