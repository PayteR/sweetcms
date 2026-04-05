/**
 * Wire core-billing module dependencies to project-specific implementations.
 * Imported as a side-effect in server.ts.
 */
import { setPaymentsDeps } from '@/core-billing/deps';
import { PLANS, getPlan, getPlanByProviderPriceId, getProviderPriceId } from '@/config/plans';
import { getEnabledProviderConfigs } from '@/config/payment-providers';
import { resolveOrgId } from '@/server/lib/resolve-org';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/core/types/notifications';
import { enqueueTemplateEmail } from '@/server/jobs/email/index';

setPaymentsDeps({
  getPlans: () => PLANS,
  getPlan,
  getPlanByProviderPriceId,
  getProviderPriceId,
  getEnabledProviderConfigs,

  resolveOrgId(activeOrgId, userId) {
    return resolveOrgId(activeOrgId, userId);
  },

  sendOrgNotification(orgId, { title, body, actionUrl }) {
    sendOrgNotification(orgId, {
      title,
      body,
      type: NotificationType.INFO,
      category: NotificationCategory.SYSTEM,
      actionUrl,
    });
  },

  enqueueTemplateEmail(to, template, data) {
    return enqueueTemplateEmail(to, template as any, data as Record<string, string>);
  },

  broadcastEvent(channel, type, payload) {
    import('@/server/lib/ws')
      .then(({ broadcastToChannel }) => broadcastToChannel(channel, type, payload))
      .catch(() => {});
  },
});
