import { HttpError } from './http.js';
import { str, oneOf, bool, url } from './validate.js';
import { isIso } from './time.js';

export function parseAnnouncement(body, { partial }) {
  const has = (k) => Object.prototype.hasOwnProperty.call(body, k);
  const out = {};
  if (!partial || has('message')) out.message = str(body.message, 'message', { required: true, max: 180, label: 'Message' });
  if (has('link_url')) out.link_url = url(body.link_url, 'link_url');
  if (has('link_label')) out.link_label = str(body.link_label, 'link_label', { max: 40, label: 'Link label' });
  if (has('tone')) out.tone = oneOf(body.tone, 'tone', ['gold', 'navy', 'coral']);
  for (const k of ['starts_at', 'ends_at']) {
    if (has(k)) {
      if (body[k] && !isIso(body[k])) throw new HttpError(422, 'Invalid date.', { field: k });
      out[k] = body[k] ? new Date(body[k]).toISOString() : null;
    }
  }
  if (has('active')) out.active = bool(body.active) ? 1 : 0;
  if (out.starts_at && out.ends_at && out.ends_at <= out.starts_at) throw new HttpError(422, 'End must be after start.', { field: 'ends_at' });
  return out;
}
