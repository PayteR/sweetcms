import { NextResponse } from 'next/server';
import { getProvider } from '@/server/lib/payment/factory';
import { activateSubscription } from '@/server/lib/payment/subscription-service';
import { logAudit } from '@/engine/lib/audit';
import { db } from '@/server/db';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/engine/types/notifications';
import { createLogger } from '@/engine/lib/logger';

const logger = createLogger('nowpayments-webhook');

export async function POST(request: Request) {
  const provider = getProvider('nowpayments');
  if (!provider) {
    return NextResponse.json({ error: 'NOWPayments not configured' }, { status: 503 });
  }

  let event;
  try {
    event = await provider.handleWebhook(request);
  } catch (err) {
    logger.error('NOWPayments webhook verification failed', { error: String(err) });
    return NextResponse.json({ error: 'Invalid webhook' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'subscription.activated': {
        if (!event.organizationId) break;

        await activateSubscription({
          organizationId: event.organizationId,
          planId: event.planId ?? 'free',
          providerId: 'nowpayments',
          interval: 'yearly',
          providerCustomerId: event.providerCustomerId ?? '',
          status: event.status,
          periodStart: event.periodStart,
          periodEnd: event.periodEnd,
        });

        logAudit({
          db,
          userId: 'system',
          action: 'subscription.created',
          entityType: 'subscription',
          entityId: event.providerCustomerId ?? 'unknown',
          metadata: { orgId: event.organizationId, planId: event.planId, provider: 'nowpayments' },
        });

        sendOrgNotification(event.organizationId, {
          title: 'Payment confirmed',
          body: `Your crypto payment for the ${event.planId ?? 'selected'} plan has been confirmed. Your subscription is now active.`,
          type: NotificationType.SUCCESS,
          category: NotificationCategory.BILLING,
          actionUrl: '/dashboard/settings/billing',
        });
        break;
      }

      case 'payment.failed': {
        if (!event.organizationId) break;

        sendOrgNotification(event.organizationId, {
          title: 'Payment failed',
          body: 'Your crypto payment has failed or expired. Please try again.',
          type: NotificationType.ERROR,
          category: NotificationCategory.BILLING,
          actionUrl: '/dashboard/settings/billing',
        });
        break;
      }

      case 'payment.refunded': {
        if (!event.organizationId) break;

        sendOrgNotification(event.organizationId, {
          title: 'Payment refunded',
          body: 'Your crypto payment has been refunded.',
          type: NotificationType.WARNING,
          category: NotificationCategory.BILLING,
          actionUrl: '/dashboard/settings/billing',
        });
        break;
      }
    }
  } catch (err) {
    logger.error('Error processing NOWPayments webhook', { error: String(err) });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
