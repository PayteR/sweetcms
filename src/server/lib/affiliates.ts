import { eq, and, sql } from 'drizzle-orm';
import { db } from '@/server/db';
import { saasAffiliates, saasReferrals, saasAffiliateEvents } from '@/server/db/schema/affiliates';
import { createLogger } from '@/engine/lib/logger';

const log = createLogger('affiliates');

/**
 * Capture a referral after user registration.
 * Looks up affiliate by code, verifies active, creates referral record.
 * Fire-and-forget — catches all errors.
 */
export async function captureReferral(userId: string, refCode: string): Promise<void> {
  try {
    const [affiliate] = await db
      .select()
      .from(saasAffiliates)
      .where(and(eq(saasAffiliates.code, refCode), eq(saasAffiliates.status, 'active')))
      .limit(1);

    if (!affiliate) {
      log.debug('Invalid or inactive affiliate code', { refCode });
      return;
    }

    // Don't allow self-referral
    if (affiliate.userId === userId) {
      log.debug('Self-referral attempt blocked', { userId, refCode });
      return;
    }

    // Check if user already referred
    const [existing] = await db
      .select({ id: saasReferrals.id })
      .from(saasReferrals)
      .where(eq(saasReferrals.referredUserId, userId))
      .limit(1);

    if (existing) {
      log.debug('User already referred', { userId });
      return;
    }

    const referralId = crypto.randomUUID();
    await db.insert(saasReferrals).values({
      id: referralId,
      affiliateId: affiliate.id,
      referredUserId: userId,
      status: 'pending',
    });

    // Log signup event
    await db.insert(saasAffiliateEvents).values({
      affiliateId: affiliate.id,
      referralId,
      type: 'signup',
    });

    // Increment total referrals
    await db
      .update(saasAffiliates)
      .set({
        totalReferrals: sql`${saasAffiliates.totalReferrals} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(saasAffiliates.id, affiliate.id));

    log.info('Referral captured', { affiliateId: affiliate.id, referralId, userId });
  } catch (err) {
    log.error('Failed to capture referral', { userId, refCode, error: String(err) });
  }
}

/**
 * Record a conversion when a referred user makes a purchase.
 * Calculates commission based on affiliate's commission percentage.
 * Fire-and-forget — catches all errors.
 */
export async function recordConversion(
  userId: string,
  transactionId: string,
  amountCents: number
): Promise<void> {
  try {
    // Find pending referral for this user
    const [referral] = await db
      .select({
        id: saasReferrals.id,
        affiliateId: saasReferrals.affiliateId,
      })
      .from(saasReferrals)
      .where(and(
        eq(saasReferrals.referredUserId, userId),
        eq(saasReferrals.status, 'pending')
      ))
      .limit(1);

    if (!referral) return;

    // Get affiliate commission rate
    const [affiliate] = await db
      .select({ commissionPercent: saasAffiliates.commissionPercent })
      .from(saasAffiliates)
      .where(eq(saasAffiliates.id, referral.affiliateId))
      .limit(1);

    if (!affiliate) return;

    // Mark converted
    await db
      .update(saasReferrals)
      .set({ status: 'converted', convertedAt: new Date() })
      .where(eq(saasReferrals.id, referral.id));

    // Log purchase event
    await db.insert(saasAffiliateEvents).values({
      affiliateId: referral.affiliateId,
      referralId: referral.id,
      type: 'purchase',
      amountCents,
      metadata: { transactionId },
    });

    // Calculate commission
    const commissionCents = Math.round(amountCents * affiliate.commissionPercent / 100);

    // Log commission event
    await db.insert(saasAffiliateEvents).values({
      affiliateId: referral.affiliateId,
      referralId: referral.id,
      type: 'commission',
      amountCents: commissionCents,
      metadata: { transactionId, originalAmount: amountCents },
    });

    // Update affiliate totals
    await db
      .update(saasAffiliates)
      .set({
        totalEarningsCents: sql`${saasAffiliates.totalEarningsCents} + ${commissionCents}`,
        updatedAt: new Date(),
      })
      .where(eq(saasAffiliates.id, referral.affiliateId));

    log.info('Conversion recorded', {
      affiliateId: referral.affiliateId,
      referralId: referral.id,
      amountCents,
      commissionCents,
    });
  } catch (err) {
    log.error('Failed to record conversion', { userId, transactionId, error: String(err) });
  }
}
