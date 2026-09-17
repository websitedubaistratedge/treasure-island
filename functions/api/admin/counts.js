import { handle, json } from '../../../src/lib/http.js';
import { one } from '../../../src/lib/db.js';

// Cheap numbers for the sidebar badges; polled while the panel is open.
export const onRequestGet = handle(async ({ env }) => {
  const row = await one(env.DB, `SELECT
      (SELECT COUNT(*) FROM orders WHERE status IN ('pending','awaiting_payment')
         AND (hold_expires_at IS NULL OR hold_expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now'))) AS openOrders,
      (SELECT COUNT(*) FROM enquiries WHERE status = 'new') AS newEnquiries`);
  return json(row);
});
