import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import type { DbClient } from '@/server/db';
import { cmsWebhooks } from '@/server/db/schema/webhooks';

/** Dispatch webhook to all active hooks matching the event. Fire-and-forget. */
export function dispatchWebhook(
  db: DbClient,
  event: string,
  payload: Record<string, unknown>
): void {
  db.select()
    .from(cmsWebhooks)
    .where(eq(cmsWebhooks.active, true))
    .then((hooks) => {
      for (const hook of hooks) {
        const events = hook.events as string[];
        if (!events.includes(event)) continue;

        const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data: payload });
        const signature = crypto
          .createHmac('sha256', hook.secret)
          .update(body)
          .digest('hex');

        fetch(hook.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Webhook-Signature': signature,
          },
          body,
        }).catch(() => {
          // Webhook delivery is fire-and-forget
        });
      }
    })
    .catch(() => {
      // Silently ignore DB errors for webhook dispatch
    });
}
