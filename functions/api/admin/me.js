import { handle, json } from '../../../src/lib/http.js';
import { publicAdmin } from '../../../src/lib/auth.js';
import { getSettings, stripeReady } from '../../../src/lib/settings.js';

export const onRequestGet = handle(async ({ env, data }) => {
  const settings = await getSettings(env.DB);
  return json({
    admin: publicAdmin(data.admin),
    flags: {
      bookingEnabled: !!settings.online_booking.enabled,
      stripeKeys: !!(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
      stripeLive: stripeReady(env, settings),
      emailConfigured: !!(env.RESEND_API_KEY && env.EMAIL_FROM),
    },
  });
});
