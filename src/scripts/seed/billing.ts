/**
 * Seed Billing Demo Data
 *
 * Creates realistic demo data for the subscription admin dashboard:
 * - 20 customers, 12 orgs, 15 subscriptions, 40 transactions
 * - 5 discount codes, 6 affiliates with referrals + events
 * - Token balances + ledger entries for all orgs
 *
 * Uses faker seed(42) for deterministic output.
 * Safe to run multiple times — skips if billing data already exists.
 */

import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { count } from 'drizzle-orm';
import crypto from 'crypto';
import { faker } from '@faker-js/faker';
import { hashPassword } from '@/lib/password';
import { log } from './helpers';

// ─── Configuration ──────────────────────────────────────────────────────────

const SEED = 42; // deterministic faker output
const NUM_CUSTOMERS = 20;
const NUM_ORGS = 12;
const NUM_SUBSCRIPTIONS = 15;
const NUM_TRANSACTIONS = 40;
const NUM_DISCOUNT_CODES = 5;
const NUM_AFFILIATES = 6;
const TRANSACTION_SPREAD_DAYS = 120;

// ─── Result type ────────────────────────────────────────────────────────────

export interface BillingResult {
  userIds: string[];
  orgIds: string[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function uuid(): string {
  return crypto.randomUUID();
}

function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}

function pick<T>(arr: T[]): T {
  return faker.helpers.arrayElement(arr);
}

// ─── Plan data (mirrors src/config/plans.ts) ────────────────────────────────

const PLANS = ['starter', 'pro', 'enterprise'] as const;
const PLAN_PRICES: Record<string, { monthly: number; yearly: number }> = {
  starter: { monthly: 1900, yearly: 19000 },
  pro: { monthly: 4900, yearly: 49000 },
  enterprise: { monthly: 9900, yearly: 99000 },
};

const DISCOUNT_TYPES = ['percentage', 'fixed_price', 'trial', 'free_trial'] as const;

// ─── Main ───────────────────────────────────────────────────────────────────

export async function seedBilling(
  db: PostgresJsDatabase,
  superadminUserId: string,
): Promise<BillingResult> {
  faker.seed(SEED);

  const { user, account } = await import('../../server/db/schema/auth');
  const { organization, member } = await import('../../server/db/schema/organization');
  const {
    saasSubscriptions,
    saasPaymentTransactions,
    saasDiscountCodes,
    saasDiscountUsages,
  } = await import('@/core-payments/schema/billing');
  const {
    saasAffiliates,
    saasReferrals,
    saasAffiliateEvents,
  } = await import('@/core-affiliates/schema/affiliates');

  // ─── Idempotency check ────────────────────────────────────────────
  const [existingSubs] = await db.select({ count: count() }).from(saasSubscriptions);
  if ((existingSubs?.count ?? 0) > 0) {
    log('\u23ED\uFE0F', 'Billing data already exists. Skipping seed.');
    return { userIds: [], orgIds: [] };
  }

  // ─── 1. Customers ─────────────────────────────────────────────────
  log('\uD83D\uDC64', `Creating ${NUM_CUSTOMERS} customers...`);
  const hashedPw = await hashPassword('demo1234');
  const userIds: string[] = [];

  for (let i = 0; i < NUM_CUSTOMERS; i++) {
    const id = uuid();
    userIds.push(id);
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();

    await db.insert(user).values({
      id,
      name: `${firstName} ${lastName}`,
      email: faker.internet.email({ firstName, lastName }).toLowerCase(),
      emailVerified: faker.datatype.boolean(0.8),
      image: faker.image.avatar(),
      role: 'user',
      createdAt: faker.date.past({ years: 1 }),
    }).onConflictDoNothing();

    await db.insert(account).values({
      id: uuid(),
      accountId: id,
      providerId: 'credential',
      userId: id,
      password: hashedPw,
    }).onConflictDoNothing();
  }
  log('\u2705', `${NUM_CUSTOMERS} customers created.`);

  // ─── 2. Organizations ─────────────────────────────────────────────
  log('\uD83C\uDFE2', `Creating ${NUM_ORGS} organizations...`);
  const orgIds: string[] = [];

  for (let i = 0; i < NUM_ORGS; i++) {
    const orgId = uuid();
    orgIds.push(orgId);
    const companyName = faker.company.name();

    await db.insert(organization).values({
      id: orgId,
      name: companyName,
      slug: faker.helpers.slugify(companyName).toLowerCase().slice(0, 40),
      logo: faker.image.urlPicsumPhotos({ width: 64, height: 64 }),
      createdAt: faker.date.past({ years: 1 }),
    }).onConflictDoNothing();

    // First org owned by superadmin, rest by faker users
    const ownerId = i === 0 ? superadminUserId : userIds[i % userIds.length]!;

    await db.insert(member).values({
      id: uuid(),
      organizationId: orgId,
      userId: ownerId,
      role: 'owner',
      createdAt: faker.date.past({ years: 1 }),
    }).onConflictDoNothing();

    // 1-3 extra members
    const extraMembers = faker.number.int({ min: 1, max: 3 });
    for (let m = 0; m < extraMembers; m++) {
      const memberIdx = (i + m + NUM_ORGS) % userIds.length;
      await db.insert(member).values({
        id: uuid(),
        organizationId: orgId,
        userId: userIds[memberIdx]!,
        role: pick(['member', 'member', 'admin']),
        createdAt: faker.date.past({ years: 1 }),
      }).onConflictDoNothing();
    }
  }
  log('\u2705', `${NUM_ORGS} organizations created.`);

  // ─── 3. Subscriptions ─────────────────────────────────────────────
  log('\uD83D\uDCB3', `Creating ${NUM_SUBSCRIPTIONS} subscriptions...`);

  const statusWeights = [
    { value: 'active', weight: 50 },
    { value: 'trialing', weight: 10 },
    { value: 'canceled', weight: 20 },
    { value: 'past_due', weight: 10 },
    { value: 'unpaid', weight: 10 },
  ] as const;

  for (let i = 0; i < NUM_SUBSCRIPTIONS; i++) {
    const plan = pick([...PLANS]);
    const interval = pick(['monthly', 'yearly']);
    const status = faker.helpers.weightedArrayElement([...statusWeights]);
    const createdDaysAgo = faker.number.int({ min: 5, max: TRANSACTION_SPREAD_DAYS });
    const periodStart = daysAgo(createdDaysAgo);
    const periodDays = interval === 'monthly' ? 30 : 365;
    const periodEnd = new Date(periodStart.getTime() + periodDays * 24 * 60 * 60 * 1000);
    const canceledDaysAgo = status === 'canceled'
      ? faker.number.int({ min: 1, max: createdDaysAgo })
      : 0;

    await db.insert(saasSubscriptions).values({
      id: uuid(),
      organizationId: orgIds[i % orgIds.length]!,
      providerId: pick(['stripe', 'stripe', 'stripe', 'nowpayments']),
      providerCustomerId: `cus_${faker.string.alphanumeric(14)}`,
      providerSubscriptionId: `sub_${faker.string.alphanumeric(14)}`,
      planId: plan,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: status === 'canceled',
      trialEnd: status === 'trialing'
        ? new Date(Date.now() + faker.number.int({ min: 1, max: 14 }) * 24 * 60 * 60 * 1000)
        : null,
      createdAt: daysAgo(createdDaysAgo),
      updatedAt: status === 'canceled' ? daysAgo(canceledDaysAgo) : daysAgo(createdDaysAgo),
    });
  }
  log('\u2705', `${NUM_SUBSCRIPTIONS} subscriptions created.`);

  // ─── 4. Transactions ──────────────────────────────────────────────
  log('\uD83D\uDCB0', `Creating ${NUM_TRANSACTIONS} transactions...`);

  const txStatusWeights = [
    { value: 'successful', weight: 75 },
    { value: 'pending', weight: 5 },
    { value: 'failed', weight: 10 },
    { value: 'refunded', weight: 10 },
  ] as const;

  for (let i = 0; i < NUM_TRANSACTIONS; i++) {
    const plan = pick([...PLANS]);
    const interval = pick(['monthly', 'yearly']);
    const prices = PLAN_PRICES[plan]!;
    const baseAmount = interval === 'monthly' ? prices.monthly : prices.yearly;
    const orgIdx = faker.number.int({ min: 0, max: orgIds.length - 1 });
    const txDay = Math.round((i / NUM_TRANSACTIONS) * TRANSACTION_SPREAD_DAYS);

    await db.insert(saasPaymentTransactions).values({
      id: uuid(),
      organizationId: orgIds[orgIdx]!,
      userId: userIds[orgIdx % userIds.length]!,
      providerId: 'stripe',
      providerTxId: `pi_${faker.string.alphanumeric(24)}`,
      amountCents: baseAmount,
      currency: 'usd',
      status: faker.helpers.weightedArrayElement([...txStatusWeights]),
      planId: plan,
      interval,
      discountCodeId: null,
      discountAmountCents: 0,
      createdAt: daysAgo(txDay),
      updatedAt: daysAgo(txDay),
    });
  }
  log('\u2705', `${NUM_TRANSACTIONS} transactions created.`);

  // ─── 5. Discount codes ────────────────────────────────────────────
  log('\uD83C\uDFF7\uFE0F', `Creating ${NUM_DISCOUNT_CODES} discount codes...`);

  for (let i = 0; i < NUM_DISCOUNT_CODES; i++) {
    const discountType = pick([...DISCOUNT_TYPES]);
    const codeId = uuid();
    const currentUses = faker.number.int({ min: 0, max: 30 });
    const maxUses = faker.datatype.boolean(0.7)
      ? faker.number.int({ min: currentUses, max: 200 })
      : null;

    await db.insert(saasDiscountCodes).values({
      id: codeId,
      code: faker.string.alpha({ length: faker.number.int({ min: 4, max: 6 }), casing: 'upper' })
        + faker.number.int({ min: 10, max: 99 }),
      isActive: faker.datatype.boolean(0.8),
      discountType,
      discountValue: discountType === 'percentage'
        ? faker.number.int({ min: 5, max: 50 })
        : discountType === 'fixed_price'
          ? faker.number.int({ min: 500, max: 5000 })
          : null,
      trialDays: discountType === 'trial' || discountType === 'free_trial'
        ? faker.number.int({ min: 7, max: 30 })
        : null,
      trialPriceCents: discountType === 'trial'
        ? faker.number.int({ min: 100, max: 1000 })
        : null,
      maxUses,
      currentUses,
      maxUsesPerUser: 1,
      validFrom: daysAgo(faker.number.int({ min: 30, max: 120 })),
      validUntil: faker.datatype.boolean(0.6)
        ? new Date(Date.now() + faker.number.int({ min: 30, max: 180 }) * 24 * 60 * 60 * 1000)
        : null,
      createdAt: daysAgo(faker.number.int({ min: 30, max: 120 })),
    });

    // A few usage records
    const usageCount = Math.min(currentUses, faker.number.int({ min: 1, max: 5 }));
    for (let u = 0; u < usageCount; u++) {
      await db.insert(saasDiscountUsages).values({
        id: uuid(),
        userId: pick(userIds),
        discountCodeId: codeId,
        planId: pick([...PLANS]),
        appliedAt: faker.date.recent({ days: 60 }),
        usedAt: faker.datatype.boolean(0.7) ? faker.date.recent({ days: 30 }) : null,
      }).onConflictDoNothing();
    }
  }
  log('\u2705', `${NUM_DISCOUNT_CODES} discount codes created.`);

  // ─── 6. Affiliates ────────────────────────────────────────────────
  log('\uD83E\uDD1D', `Creating ${NUM_AFFILIATES} affiliates...`);

  for (let i = 0; i < NUM_AFFILIATES; i++) {
    const affId = uuid();
    const totalReferrals = faker.number.int({ min: 2, max: 20 });
    const convertedCount = Math.ceil(totalReferrals * faker.number.float({ min: 0.3, max: 0.8 }));
    const commissionPercent = pick([15, 20, 20, 20, 25, 30]);
    const avgPurchase = pick([1900, 4900, 9900]);
    const totalEarnings = Math.round(convertedCount * avgPurchase * commissionPercent / 100);

    await db.insert(saasAffiliates).values({
      id: affId,
      userId: userIds[i]!,
      code: faker.string.alpha({ length: 3, casing: 'upper' })
        + '-'
        + faker.string.alphanumeric({ length: 5, casing: 'upper' }),
      commissionPercent,
      status: faker.helpers.weightedArrayElement([
        { value: 'active', weight: 80 },
        { value: 'suspended', weight: 15 },
        { value: 'banned', weight: 5 },
      ]),
      totalReferrals,
      totalEarningsCents: totalEarnings,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 30 }),
    });

    // Create referral records
    const refCount = Math.min(totalReferrals, 8); // cap actual records
    for (let r = 0; r < refCount; r++) {
      const refId = uuid();
      const isConverted = r < convertedCount;

      await db.insert(saasReferrals).values({
        id: refId,
        affiliateId: affId,
        referredUserId: uuid(), // synthetic user IDs for referrals
        status: isConverted ? 'converted' : 'pending',
        convertedAt: isConverted ? faker.date.recent({ days: 60 }) : null,
        createdAt: faker.date.past({ years: 1 }),
      });

      // Signup event
      await db.insert(saasAffiliateEvents).values({
        id: uuid(),
        affiliateId: affId,
        referralId: refId,
        type: 'signup',
        amountCents: null,
        createdAt: faker.date.past({ years: 1 }),
      });

      if (isConverted) {
        const purchaseAmount = pick([1900, 4900, 9900, 19000, 49000]);
        const commission = Math.round(purchaseAmount * commissionPercent / 100);

        await db.insert(saasAffiliateEvents).values({
          id: uuid(),
          affiliateId: affId,
          referralId: refId,
          type: 'purchase',
          amountCents: purchaseAmount,
          metadata: { transactionId: `pi_${faker.string.alphanumeric(16)}` },
          createdAt: faker.date.recent({ days: 60 }),
        });

        await db.insert(saasAffiliateEvents).values({
          id: uuid(),
          affiliateId: affId,
          referralId: refId,
          type: 'commission',
          amountCents: commission,
          createdAt: faker.date.recent({ days: 55 }),
        });
      }
    }
  }
  log('\u2705', `${NUM_AFFILIATES} affiliates created.`);

  // ─── 7. Token balances ──────────────────────────────────────────────
  log('\uD83E\uDE99', `Creating token balances for ${NUM_ORGS} organizations...`);

  const {
    saasTokenBalances,
    saasTokenTransactions,
  } = await import('@/core-payments/schema/billing');

  for (let i = 0; i < orgIds.length; i++) {
    const balance = faker.number.int({ min: 50, max: 5000 });
    const lifetimeAdded = balance + faker.number.int({ min: 100, max: 3000 });
    const lifetimeUsed = lifetimeAdded - balance;

    await db.insert(saasTokenBalances).values({
      id: uuid(),
      organizationId: orgIds[i]!,
      balance,
      lifetimeAdded,
      lifetimeUsed,
      createdAt: faker.date.past({ years: 1 }),
      updatedAt: faker.date.recent({ days: 7 }),
    }).onConflictDoNothing();

    // A few ledger entries
    const txCount = faker.number.int({ min: 3, max: 8 });
    let runningBalance = 0;
    for (let t = 0; t < txCount; t++) {
      const isCredit = t === 0 || faker.datatype.boolean(0.3);
      const amount = isCredit
        ? faker.number.int({ min: 100, max: 2000 })
        : -faker.number.int({ min: 10, max: 200 });
      runningBalance = Math.max(0, runningBalance + amount);

      await db.insert(saasTokenTransactions).values({
        id: uuid(),
        organizationId: orgIds[i]!,
        amount,
        balanceAfter: runningBalance,
        reason: isCredit
          ? pick(['purchase', 'bonus', 'refund'])
          : pick(['usage', 'ai-generate', 'api-call']),
        metadata: !isCredit ? { feature: pick(['ai-generate', 'image-resize', 'translation', 'export']) } : null,
        createdAt: daysAgo(Math.round((t / txCount) * 60)),
      });
    }
  }
  log('\u2705', `Token balances and ${NUM_ORGS * 5} ledger entries created.`);

  return { userIds, orgIds };
}
