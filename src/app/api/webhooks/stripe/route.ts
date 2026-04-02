import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptionEvents } from '@/server/db/schema';
import { getProvider } from '@/server/lib/payment/factory';
import {
  activateSubscription,
  updateSubscription,
  cancelSubscription,
  getOrgByProviderSubscription,
} from '@/server/lib/payment/subscription-service';
import { logAudit } from '@/engine/lib/audit';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/engine/types/notifications';
import { createLogger } from '@/engine/lib/logger';

const logger = createLogger('stripe-webhook');

export async function POST(request: Request) {
  const stripeProvider = await getProvider('stripe');
  if (!stripeProvider) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  // Clone request so we can read body twice (once for signature verification in provider)
  const clonedRequest = request.clone();

  let event;
  try {
    event = await stripeProvider.handleWebhook(clonedRequest);
  } catch (err) {
    logger.error('Stripe webhook verification failed', { error: String(err) });
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check via _eventId set by the Stripe provider
  const stripeEventId = (event.providerData as Record<string, unknown>)?._eventId as string | undefined;
  if (!stripeEventId) {
    return NextResponse.json({ error: 'Missing event ID' }, { status: 400 });
  }

  const [existing] = await db
    .select({ id: saasSubscriptionEvents.id })
    .from(saasSubscriptionEvents)
    .where(eq(saasSubscriptionEvents.providerEventId, stripeEventId))
    .limit(1);

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Log event for idempotency
  await db.insert(saasSubscriptionEvents).values({
    providerId: 'stripe',
    providerEventId: stripeEventId,
    type: event.type,
    data: event.providerData as Record<string, unknown>,
  });

  try {
    switch (event.type) {
      case 'subscription.activated': {
        if (!event.organizationId || !event.providerSubscriptionId) break;

        await activateSubscription({
          organizationId: event.organizationId,
          planId: event.planId ?? 'free',
          providerId: 'stripe',
          interval: 'monthly', // determined by price, but we'll use what's available
          providerCustomerId: event.providerCustomerId ?? '',
          providerSubscriptionId: event.providerSubscriptionId,
          providerPriceId: event.providerPriceId,
          status: event.status,
          periodStart: event.periodStart,
          periodEnd: event.periodEnd,
        });

        logAudit({
          db,
          userId: 'system',
          action: 'subscription.created',
          entityType: 'subscription',
          entityId: event.providerSubscriptionId,
          metadata: { orgId: event.organizationId, planId: event.planId },
        });

        sendOrgNotification(event.organizationId, {
          title: 'Subscription activated',
          body: `Your subscription to the ${event.planId ?? 'selected'} plan is now active.`,
          type: NotificationType.SUCCESS,
          category: NotificationCategory.BILLING,
          actionUrl: '/dashboard/settings/billing',
        });
        break;
      }

      case 'subscription.updated': {
        if (!event.providerSubscriptionId) break;

        await updateSubscription(event.providerSubscriptionId, {
          planId: event.planId,
          status: event.status,
          providerPriceId: event.providerPriceId,
          periodStart: event.periodStart,
          periodEnd: event.periodEnd,
          cancelAtPeriodEnd: event.cancelAtPeriodEnd,
        });
        break;
      }

      case 'subscription.canceled': {
        if (!event.providerSubscriptionId) break;

        const orgId = await getOrgByProviderSubscription(event.providerSubscriptionId);

        await cancelSubscription(event.providerSubscriptionId);

        if (orgId) {
          sendOrgNotification(orgId, {
            title: 'Subscription canceled',
            body: 'Your subscription has been canceled. You have been moved to the free plan.',
            type: NotificationType.WARNING,
            category: NotificationCategory.BILLING,
            actionUrl: '/dashboard/settings/billing',
          });
        }
        break;
      }

      case 'payment.failed': {
        if (!event.providerSubscriptionId) break;

        const failedOrgId = await getOrgByProviderSubscription(event.providerSubscriptionId);

        await updateSubscription(event.providerSubscriptionId, {
          status: 'past_due',
        });

        if (failedOrgId) {
          sendOrgNotification(failedOrgId, {
            title: 'Payment failed',
            body: 'Payment failed for your subscription. Please update your payment method to avoid service interruption.',
            type: NotificationType.ERROR,
            category: NotificationCategory.BILLING,
            actionUrl: '/dashboard/settings/billing',
          });
        }
        break;
      }
    }
  } catch (err) {
    logger.error('Error processing Stripe webhook', { error: String(err) });
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
