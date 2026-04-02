import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptionEvents } from '@/server/db/schema';
import { getProvider } from '@/server/lib/payment/factory';
import { activateSubscription } from '@/server/lib/payment/subscription-service';
import { finalizeUsage } from '@/server/lib/payment/discount-service';
import { logAudit } from '@/engine/lib/audit';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/engine/types/notifications';
import { createLogger } from '@/engine/lib/logger';
import { adminPanel } from '@/config/routes';

const logger = createLogger('nowpayments-webhook');

export async function POST(request: Request) {
  const provider = await getProvider('nowpayments');
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

  // Idempotency check: use order_id from providerData as unique event ID
  const providerData = event.providerData as Record<string, unknown> | undefined;
  const orderId = providerData?.order_id as string | undefined;
  const paymentStatus = providerData?.payment_status as string | undefined;
  const idempotencyKey = orderId ? `np_${orderId}_${paymentStatus ?? 'unknown'}` : null;

  if (idempotencyKey) {
    const [existing] = await db
      .select({ id: saasSubscriptionEvents.id })
      .from(saasSubscriptionEvents)
      .where(eq(saasSubscriptionEvents.providerEventId, idempotencyKey))
      .limit(1);

    if (existing) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    await db.insert(saasSubscriptionEvents).values({
      providerId: 'nowpayments',
      providerEventId: idempotencyKey,
      type: event.type,
      data: providerData as Record<string, unknown>,
    });
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

        // Finalize discount usage if one was applied at checkout
        // The discountUsageId is stored in the transaction metadata (set by billing router)
        const discountUsageId = providerData?.discountUsageId as string | undefined;
        if (discountUsageId && orderId) {
          await finalizeUsage(discountUsageId, orderId);
        }

        logAudit({
          db,
          userId: 'system',
          action: 'subscription.created',
          entityType: 'subscription',
          entityId: orderId ?? 'unknown',
          metadata: { orgId: event.organizationId, planId: event.planId, provider: 'nowpayments' },
        });

        sendOrgNotification(event.organizationId, {
          title: 'Payment confirmed',
          body: `Your crypto payment for the ${event.planId ?? 'selected'} plan has been confirmed. Your subscription is now active.`,
          type: NotificationType.SUCCESS,
          category: NotificationCategory.BILLING,
          actionUrl: adminPanel.settingsBilling,
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
          actionUrl: adminPanel.settingsBilling,
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
          actionUrl: adminPanel.settingsBilling,
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
