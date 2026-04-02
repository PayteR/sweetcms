import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptions, saasSubscriptionEvents } from '@/server/db/schema';
import { getStripe } from '@/server/lib/stripe';
import { getPlanByStripePriceId } from '@/config/plans';
import { logAudit } from '@/engine/lib/audit';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/engine/types/notifications';

export async function POST(request: Request) {
  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Billing not configured' }, { status: 503 });
  }

  const body = await request.text();
  const signature = request.headers.get('stripe-signature');

  if (!signature || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  // Idempotency check
  const [existing] = await db
    .select({ id: saasSubscriptionEvents.id })
    .from(saasSubscriptionEvents)
    .where(eq(saasSubscriptionEvents.stripeEventId, event.id))
    .limit(1);

  if (existing) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Log event for idempotency
  await db.insert(saasSubscriptionEvents).values({
    stripeEventId: event.id,
    type: event.type,
    data: event.data.object as unknown as Record<string, unknown>,
  });

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const orgId = session.metadata?.orgId;
        if (!orgId || !session.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          session.subscription as string
        );
        const firstItem = subscription.items.data[0];
        const priceId = firstItem?.price.id;
        const plan = priceId ? getPlanByStripePriceId(priceId) : null;
        const periodStart = firstItem ? new Date(firstItem.current_period_start * 1000) : null;
        const periodEnd = firstItem ? new Date(firstItem.current_period_end * 1000) : null;

        await db
          .insert(saasSubscriptions)
          .values({
            organizationId: orgId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subscription.id,
            stripePriceId: priceId ?? null,
            planId: plan?.id ?? 'free',
            status: subscription.status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
          })
          .onConflictDoUpdate({
            target: saasSubscriptions.stripeSubscriptionId,
            set: {
              stripePriceId: priceId ?? null,
              planId: plan?.id ?? 'free',
              status: subscription.status,
              currentPeriodStart: periodStart,
              currentPeriodEnd: periodEnd,
              updatedAt: new Date(),
            },
          });

        logAudit({
          db,
          userId: 'system',
          action: 'subscription.created',
          entityType: 'subscription',
          entityId: subscription.id,
          metadata: { orgId, planId: plan?.id },
        });

        sendOrgNotification(orgId, {
          title: 'Subscription activated',
          body: `Your subscription to the ${plan?.name ?? 'selected'} plan is now active.`,
          type: NotificationType.SUCCESS,
          category: NotificationCategory.BILLING,
          actionUrl: '/dashboard/settings',
        });
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const firstItem = subscription.items.data[0];
        const priceId = firstItem?.price.id;
        const plan = priceId ? getPlanByStripePriceId(priceId) : null;
        const periodStart = firstItem ? new Date(firstItem.current_period_start * 1000) : null;
        const periodEnd = firstItem ? new Date(firstItem.current_period_end * 1000) : null;

        await db
          .update(saasSubscriptions)
          .set({
            stripePriceId: priceId ?? null,
            planId: plan?.id ?? 'free',
            status: subscription.status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: new Date(),
          })
          .where(eq(saasSubscriptions.stripeSubscriptionId, subscription.id));
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;

        // Look up orgId before updating
        const [canceledSub] = await db
          .select({ organizationId: saasSubscriptions.organizationId })
          .from(saasSubscriptions)
          .where(eq(saasSubscriptions.stripeSubscriptionId, subscription.id))
          .limit(1);

        await db
          .update(saasSubscriptions)
          .set({
            status: 'canceled',
            planId: 'free',
            updatedAt: new Date(),
          })
          .where(eq(saasSubscriptions.stripeSubscriptionId, subscription.id));

        if (canceledSub) {
          sendOrgNotification(canceledSub.organizationId, {
            title: 'Subscription canceled',
            body: 'Your subscription has been canceled. You have been moved to the free plan.',
            type: NotificationType.WARNING,
            category: NotificationCategory.BILLING,
            actionUrl: '/dashboard/settings',
          });
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subRef = invoice.parent?.subscription_details?.subscription;
        if (subRef) {
          const subId = typeof subRef === 'string' ? subRef : subRef.id;

          // Look up orgId for notification
          const [failedSub] = await db
            .select({ organizationId: saasSubscriptions.organizationId })
            .from(saasSubscriptions)
            .where(eq(saasSubscriptions.stripeSubscriptionId, subId))
            .limit(1);

          await db
            .update(saasSubscriptions)
            .set({ status: 'past_due', updatedAt: new Date() })
            .where(eq(saasSubscriptions.stripeSubscriptionId, subId));

          if (failedSub) {
            sendOrgNotification(failedSub.organizationId, {
              title: 'Payment failed',
              body: 'Payment failed for your subscription. Please update your payment method to avoid service interruption.',
              type: NotificationType.ERROR,
              category: NotificationCategory.BILLING,
              actionUrl: '/dashboard/settings',
            });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('Error processing webhook:', err);
    return NextResponse.json({ error: 'Processing failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
