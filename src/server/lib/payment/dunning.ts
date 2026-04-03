import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasSubscriptions } from '@/server/db/schema/billing';
import { member } from '@/server/db/schema/organization';
import { user } from '@/server/db/schema/auth';
import { cmsAuditLog } from '@/server/db/schema/audit';
import { createLogger } from '@/engine/lib/logger';
import { logAudit } from '@/engine/lib/audit';
import { sendOrgNotification } from '@/server/lib/notifications';
import { NotificationType, NotificationCategory } from '@/engine/types/notifications';
import { enqueueTemplateEmail } from '@/server/jobs/email/index';
import { getPlan } from '@/config/plans';

const log = createLogger('dunning');

/**
 * Check for subscriptions expiring within 7 days and send reminders.
 * Skips if already reminded (checks audit log).
 */
export async function checkExpiringSubscriptions(): Promise<void> {
  const now = new Date();
  const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const expiring = await db
    .select({
      id: saasSubscriptions.id,
      organizationId: saasSubscriptions.organizationId,
      planId: saasSubscriptions.planId,
      providerId: saasSubscriptions.providerId,
      currentPeriodEnd: saasSubscriptions.currentPeriodEnd,
    })
    .from(saasSubscriptions)
    .where(
      and(
        eq(saasSubscriptions.status, 'active'),
        lte(saasSubscriptions.currentPeriodEnd, sevenDaysOut),
        gte(saasSubscriptions.currentPeriodEnd, now)
      )
    )
    .limit(200);

  for (const sub of expiring) {
    if (!sub.currentPeriodEnd) continue;

    // Check if already reminded
    const [alreadyReminded] = await db
      .select({ id: cmsAuditLog.id })
      .from(cmsAuditLog)
      .where(
        and(
          eq(cmsAuditLog.action, 'dunning.expiring'),
          eq(cmsAuditLog.entityId, sub.id)
        )
      )
      .limit(1);

    if (alreadyReminded) continue;

    const plan = getPlan(sub.planId);
    const daysLeft = Math.ceil(
      (sub.currentPeriodEnd.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
    );

    // Send notification to all org members
    sendOrgNotification(sub.organizationId, {
      title: 'Subscription expiring soon',
      body: `Your ${plan?.name ?? sub.planId} plan expires in ${daysLeft} days. Please renew to avoid service interruption.`,
      type: NotificationType.WARNING,
      category: NotificationCategory.BILLING,
      actionUrl: '/dashboard/settings/billing',
    });

    // Send email to org members
    const admins = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, sub.organizationId))
      .limit(10);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    for (const admin of admins) {
      enqueueTemplateEmail(admin.email, 'subscription-expiring', {
        planName: plan?.name ?? sub.planId,
        daysLeft: String(daysLeft),
        billingUrl: `${appUrl}/dashboard/settings/billing`,
      }).catch((err) => log.error('Failed to send expiring email', { error: String(err) }));
    }

    logAudit({
      db,
      userId: 'system',
      action: 'dunning.expiring',
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { orgId: sub.organizationId, daysLeft },
    });

    log.info('Sent expiring reminder', { subId: sub.id, orgId: sub.organizationId, daysLeft });
  }
}

/**
 * Check for expired subscriptions and mark as past_due.
 * Only for non-Stripe providers (Stripe handles this via webhooks).
 */
export async function checkExpiredSubscriptions(): Promise<void> {
  const now = new Date();

  const expired = await db
    .select({
      id: saasSubscriptions.id,
      organizationId: saasSubscriptions.organizationId,
      planId: saasSubscriptions.planId,
      providerId: saasSubscriptions.providerId,
    })
    .from(saasSubscriptions)
    .where(
      and(
        eq(saasSubscriptions.status, 'active'),
        lte(saasSubscriptions.currentPeriodEnd, now)
      )
    )
    .limit(200);

  for (const sub of expired) {
    // Stripe handles its own expiration via webhooks
    if (sub.providerId === 'stripe') continue;

    await db
      .update(saasSubscriptions)
      .set({ status: 'past_due', updatedAt: new Date() })
      .where(eq(saasSubscriptions.id, sub.id));

    const plan = getPlan(sub.planId);

    sendOrgNotification(sub.organizationId, {
      title: 'Subscription expired',
      body: `Your ${plan?.name ?? sub.planId} plan has expired. Please renew to continue using premium features.`,
      type: NotificationType.ERROR,
      category: NotificationCategory.BILLING,
      actionUrl: '/dashboard/settings/billing',
    });

    // Send expired email to org members
    const admins = await db
      .select({ email: user.email })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, sub.organizationId))
      .limit(10);

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
    for (const admin of admins) {
      enqueueTemplateEmail(admin.email, 'subscription-expired', {
        planName: plan?.name ?? sub.planId,
        billingUrl: `${appUrl}/dashboard/settings/billing`,
      }).catch((err) => log.error('Failed to send expired email', { error: String(err) }));
    }

    logAudit({
      db,
      userId: 'system',
      action: 'dunning.expired',
      entityType: 'subscription',
      entityId: sub.id,
      metadata: { orgId: sub.organizationId },
    });

    log.info('Marked subscription as past_due', { subId: sub.id, orgId: sub.organizationId });
  }
}

/**
 * Run all dunning checks. Called by the scheduled job.
 */
export async function runDunningChecks(): Promise<void> {
  log.info('Running dunning checks');
  try {
    await checkExpiringSubscriptions();
    await checkExpiredSubscriptions();
    log.info('Dunning checks complete');
  } catch (err) {
    log.error('Dunning check failed', { error: String(err) });
  }
}
