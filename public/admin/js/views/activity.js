import { api } from '../api.js';
import { html, ico, mount, $, fmtDateTime, ago, errorToast, raw } from '../ui.js';

const ICON = { auth: 'lock', order: 'orders', offering: 'sparkles', slot: 'calendar', product: 'bag', media: 'image', voucher: 'gift', pass: 'ticket', enquiry: 'inbox', announcement: 'megaphone', settings: 'settings', team: 'users', account: 'user' };
const TEXT = {
  'auth.login': 'Signed in', 'auth.logout': 'Signed out',
  'order.create': 'Created a booking', 'order.confirm': 'Confirmed a booking', 'order.mark_paid': 'Recorded a payment', 'order.complete': 'Completed an order',
  'order.cancel': 'Cancelled an order', 'order.refund': 'Refunded an order', 'order.notes': 'Updated order notes', 'order.export': 'Exported orders', 'order.paid_online': 'Order paid online',
  'offering.create': 'Created a programme', 'offering.update': 'Updated a programme', 'offering.archive': 'Hid a programme', 'offering.delete': 'Deleted a programme',
  'slot.create': 'Added sessions', 'slot.update': 'Updated a session', 'slot.delete': 'Deleted a session',
  'product.create': 'Added a product', 'product.update': 'Updated a product', 'product.archive': 'Hid a product', 'product.delete': 'Deleted a product', 'product.reorder': 'Reordered the boutique',
  'media.upload': 'Uploaded a photo', 'media.delete': 'Deleted a photo',
  'voucher.issue': 'Issued a gift voucher', 'voucher.redeem': 'Redeemed a gift voucher', 'voucher.void': 'Voided a voucher', 'voucher.extend': 'Extended a voucher', 'voucher.reactivate': 'Reactivated a voucher',
  'pass.issue': 'Issued a pass', 'pass.checkin': 'Checked in a pass', 'pass.void': 'Voided a pass', 'pass.add_visits': 'Added pass visits', 'pass.reactivate': 'Reactivated a pass',
  'enquiry.update': 'Updated an enquiry', 'announcement.create': 'Created an announcement', 'announcement.update': 'Updated an announcement', 'announcement.delete': 'Deleted an announcement',
  'settings.update': 'Changed settings', 'team.add': 'Added a team member', 'team.update': 'Updated a team member', 'team.remove': 'Removed a team member',
  'account.password': 'Changed their password', 'account.sessions_revoked': 'Signed out other devices',
};
function detail(r) {
  const d = r.detail || {};
  if (d.ref) return d.ref;
  if (d.code) return d.code;
  if (d.name) return d.name;
  if (d.email) return d.email;
  if (d.count != null) return `${d.count}`;
  if (r.entity === 'settings') return String(r.entity_id || '').replace(/_/g, ' ');
  return '';
}

export default async function activity(root, ctx) {
  ctx.setCrumbs([{ label: 'Activity log' }]);
  let page = 1;
  async function load() {
    const r = await api(`/audit?page=${page}`);
    if (!ctx.isCurrent()) return;
    mount(root, html`
    <div class="page-head"><div><h1>Activity log</h1><p>Every change made in this panel, newest first. It cannot be edited.</p></div></div>
    <div class="card">
      ${r.rows.length ? html`<div class="timeline">${r.rows.map((x) => {
        const area = String(x.action).split('.')[0];
        return html`<div class="tl"><span class="tl-ico">${ico(ICON[area] || 'activity')}</span>
          <div><div class="cell-main">${x.admin_name || 'System'} <span class="muted">·</span> ${TEXT[x.action] || x.action}${detail(x) ? html` <span class="mono tag">${detail(x)}</span>` : ''}</div>
          <div class="cell-sub">${fmtDateTime(x.created_at)}${x.ip ? ` · ${x.ip}` : ''}</div></div>
          <span class="sub">${ago(x.created_at)}</span></div>`;
      })}</div>` : html`<div class="empty"><b>No activity yet</b></div>`}
      <div class="pager"><span>Page ${r.page} of ${r.pages}</span><div class="row">
        <button class="btn btn-ghost btn-sm" data-p="-1" ${r.page <= 1 ? raw('disabled') : ''}>${ico('chevronLeft')} Newer</button>
        <button class="btn btn-ghost btn-sm" data-p="1" ${r.page >= r.pages ? raw('disabled') : ''}>Older ${ico('chevronRight')}</button></div></div>
    </div>`);
  }
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b) { page += Number(b.dataset.p); load().catch(errorToast); } });
  await load();
}
