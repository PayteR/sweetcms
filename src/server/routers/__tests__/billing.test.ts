import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

vi.mock('@/lib/auth', () => ({
  auth: {
    api: {
      getSession: vi.fn().mockResolvedValue(null),
    },
  },
}));

vi.mock('@/engine/lib/redis', () => ({
  getRedis: vi.fn().mockReturnValue(null),
}));

vi.mock('@/engine/lib/trpc-rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/engine/policy', () => ({
  Policy: {
    for: vi.fn().mockReturnValue({
      canAccessAdmin: vi.fn().mockReturnValue(true),
      can: vi.fn().mockReturnValue(true),
    }),
  },
  Role: {
    USER: 'user',
    EDITOR: 'editor',
    ADMIN: 'admin',
    SUPERADMIN: 'superadmin',
  },
}));

vi.mock('@/engine/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/engine/crud/admin-crud', () => ({
  buildAdminList: vi.fn().mockResolvedValue({ results: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
  buildStatusCounts: vi.fn().mockResolvedValue({ all: 0, published: 0, draft: 0, scheduled: 0, trashed: 0 }),
  parsePagination: vi.fn().mockReturnValue({ page: 1, pageSize: 20, offset: 0 }),
  paginatedResult: vi.fn().mockImplementation((items: unknown[], total: number, page: number, pageSize: number) => ({
    results: items, total, page, pageSize, totalPages: Math.ceil(total / pageSize),
  })),
  ensureSlugUnique: vi.fn().mockResolvedValue(undefined),
  fetchOrNotFound: vi.fn(),
  softDelete: vi.fn().mockResolvedValue(undefined),
  softRestore: vi.fn().mockResolvedValue(undefined),
  permanentDelete: vi.fn().mockResolvedValue(undefined),
  generateCopySlug: vi.fn().mockResolvedValue('slug-copy'),
  updateContentStatus: vi.fn().mockResolvedValue(undefined),
  getTranslationSiblings: vi.fn().mockResolvedValue([]),
  serializeExport: vi.fn().mockReturnValue({ data: '[]', contentType: 'application/json' }),
  prepareTranslationCopy: vi.fn().mockReturnValue({}),
}));

vi.mock('@/engine/lib/audit', () => ({
  logAudit: vi.fn(),
}));

// Mock payment factory
vi.mock('@/server/lib/payment/factory', () => ({
  getProvider: vi.fn().mockResolvedValue(null),
  getDefaultProvider: vi.fn().mockResolvedValue(null),
  getEnabledProviders: vi.fn().mockReturnValue([]),
  isBillingEnabled: vi.fn().mockReturnValue(false),
}));

// Mock subscription service
vi.mock('@/engine/lib/payment/subscription-service', () => ({
  getSubscription: vi.fn().mockResolvedValue(null),
}));

// Mock discount service
vi.mock('@/engine/lib/payment/discount-service', () => ({
  validateCode: vi.fn().mockResolvedValue({ valid: true, finalPriceCents: 1000 }),
  applyDiscount: vi.fn().mockResolvedValue({
    discount: { type: 'percentage', value: 10 },
    usageId: 'usage-1',
    discountCodeId: 'code-1',
  }),
  removeDiscount: vi.fn().mockResolvedValue(undefined),
  getActiveDiscount: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/engine/lib/stats-cache', () => ({
  getStats: vi.fn().mockImplementation((_key: string, fetchFn: () => Promise<unknown>) => fetchFn()),
}));

// Inline plan data inside factory
vi.mock('@/config/plans', () => {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      description: 'Free plan',
      providerPrices: {},
      priceMonthly: 0,
      priceYearly: 0,
      features: { maxMembers: 1, maxStorageMb: 100, customDomain: false, apiAccess: false, prioritySupport: false },
      displayFeatures: ['1 member'],
      cta: 'Get Started',
    },
    {
      id: 'pro',
      name: 'Pro',
      description: 'Pro plan',
      providerPrices: {
        stripe: { monthly: 'price_pro_monthly', yearly: 'price_pro_yearly' },
      },
      priceMonthly: 4900,
      priceYearly: 49000,
      trialDays: 14,
      features: { maxMembers: 20, maxStorageMb: 10240, customDomain: true, apiAccess: true, prioritySupport: false },
      displayFeatures: ['20 members'],
      cta: 'Start Trial',
      popular: true,
    },
  ];
  return {
    PLANS: plans,
    getPlan: (id: string) => plans.find((p) => p.id === id),
    getPlanByProviderPriceId: (_providerId: string, priceId: string) =>
      plans.find((p) => {
        const prices = p.providerPrices['stripe'];
        if (!prices) return false;
        return prices.monthly === priceId || prices.yearly === priceId;
      }),
    getProviderPriceId: (plan: { providerPrices: Record<string, Record<string, string>> }, providerId: string, interval: string) => {
      const prices = plan.providerPrices[providerId];
      if (!prices) return null;
      return prices[interval] ?? null;
    },
    getFreePlan: () => plans[0],
  };
});

vi.mock('@/server/db/schema', () => ({
  member: {
    organizationId: 'member.organization_id',
    userId: 'member.user_id',
    role: 'member.role',
  },
  saasSubscriptions: {
    id: 'saas_subscriptions.id',
    organizationId: 'saas_subscriptions.organization_id',
    planId: 'saas_subscriptions.plan_id',
    providerId: 'saas_subscriptions.provider_id',
    providerPriceId: 'saas_subscriptions.provider_price_id',
    status: 'saas_subscriptions.status',
    updatedAt: 'saas_subscriptions.updated_at',
  },
  saasPaymentTransactions: {
    id: 'saas_payment_transactions.id',
    createdAt: 'saas_payment_transactions.created_at',
  },
  saasDiscountCodes: {
    id: 'saas_discount_codes.id',
    isActive: 'saas_discount_codes.is_active',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import { billingRouter } from '../billing';
import { isBillingEnabled, getProvider, getEnabledProviders } from '@/server/lib/payment/factory';
import { getSubscription } from '@/engine/lib/payment/subscription-service';
import { PLANS } from '@/config/plans';
import { createMockCtx } from './test-helpers';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const ORG_ID = 'org-1';

const MOCK_MEMBER_OWNER = { organizationId: ORG_ID, userId: 'user-1', role: 'owner' };
const MOCK_MEMBER_REGULAR = { organizationId: ORG_ID, userId: 'user-1', role: 'member' };

const MOCK_SUBSCRIPTION = {
  id: 'sub-1',
  organizationId: ORG_ID,
  providerId: 'stripe',
  providerCustomerId: 'cus_123',
  providerSubscriptionId: 'sub_123',
  providerPriceId: 'price_pro_monthly',
  planId: 'pro',
  status: 'active',
  currentPeriodStart: new Date('2025-01-01'),
  currentPeriodEnd: new Date('2025-02-01'),
  cancelAtPeriodEnd: false,
  trialEnd: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
};

const MOCK_PROVIDER = {
  config: {
    id: 'stripe',
    name: 'Stripe',
    allowedIntervals: ['monthly', 'yearly'] as Array<'monthly' | 'yearly'>,
  },
  createCheckout: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/pay/xxx', providerId: 'stripe' }),
  createPortalSession: vi.fn().mockResolvedValue('https://billing.stripe.com/session/xxx'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('billingRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    asMock(isBillingEnabled).mockReturnValue(false);
    asMock(getProvider).mockResolvedValue(null);
    asMock(getSubscription).mockResolvedValue(null);
    // Reset MOCK_PROVIDER function mocks
    MOCK_PROVIDER.createCheckout.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/xxx', providerId: 'stripe' });
    MOCK_PROVIDER.createPortalSession.mockResolvedValue('https://billing.stripe.com/session/xxx');
  });

  // =========================================================================
  // getPlans
  // =========================================================================
  describe('getPlans', () => {
    it('returns all plans without providerPrices', async () => {
      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getPlans();

      expect(result).toHaveLength(PLANS.length);
      for (const plan of result) {
        expect(plan).not.toHaveProperty('providerPrices');
      }
    });

    it('includes plan metadata (name, description, price, features)', async () => {
      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getPlans();

      const freePlan = result.find((p) => p.id === 'free');
      expect(freePlan).toBeDefined();
      expect(freePlan!.name).toBe('Free');
      expect(freePlan!.priceMonthly).toBe(0);
      expect(freePlan!.features.maxMembers).toBe(1);
    });
  });

  // =========================================================================
  // getProviders
  // =========================================================================
  describe('getProviders', () => {
    it('returns empty list when no providers configured', async () => {
      asMock(getEnabledProviders).mockReturnValue([]);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getProviders();

      expect(result).toEqual([]);
    });

    it('returns configured providers', async () => {
      asMock(getEnabledProviders).mockReturnValue([{ id: 'stripe', name: 'Stripe' }]);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getProviders();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('stripe');
    });
  });

  // =========================================================================
  // getSubscription
  // =========================================================================
  describe('getSubscription', () => {
    it('throws BAD_REQUEST when no active org is selected', async () => {
      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.getSubscription()).rejects.toThrow('No active organization selected');
    });

    it('returns free plan default when no subscription exists', async () => {
      asMock(getSubscription).mockResolvedValue(null);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getSubscription();

      expect(result).toEqual({ planId: 'free', status: 'active' });
    });

    it('returns existing subscription data', async () => {
      asMock(getSubscription).mockResolvedValue(MOCK_SUBSCRIPTION);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getSubscription();

      expect(result).toEqual(MOCK_SUBSCRIPTION);
    });
  });

  // =========================================================================
  // createCheckoutSession
  // =========================================================================
  describe('createCheckoutSession', () => {
    const checkoutInput = {
      planId: 'pro',
      interval: 'monthly' as const,
      providerId: 'stripe',
    };

    it('throws PRECONDITION_FAILED when billing is not configured', async () => {
      asMock(isBillingEnabled).mockReturnValue(false);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createCheckoutSession(checkoutInput)).rejects.toThrow('Billing is not configured');
    });

    it('throws BAD_REQUEST when provider is unavailable', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(null);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createCheckoutSession(checkoutInput)).rejects.toThrow(
        'Payment provider "stripe" is not available'
      );
    });

    it('throws BAD_REQUEST when no active org is selected', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createCheckoutSession(checkoutInput)).rejects.toThrow(
        'No active organization selected'
      );
    });

    it('throws FORBIDDEN when user is not org owner/admin', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_MEMBER_REGULAR]);

      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createCheckoutSession(checkoutInput)).rejects.toThrow(
        'Only org owners/admins can manage billing'
      );
    });

    it('throws NOT_FOUND when plan does not exist', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_MEMBER_OWNER]);

      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ ...checkoutInput, planId: 'nonexistent' })
      ).rejects.toThrow('Plan not found');
    });

    it('creates a checkout session and returns redirect URL for org owner', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      ctx.db._chains.select.limit.mockResolvedValue([MOCK_MEMBER_OWNER]);

      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createCheckoutSession(checkoutInput);

      expect(result.url).toBe('https://checkout.stripe.com/pay/xxx');
      expect(result.providerId).toBe('stripe');
      expect(MOCK_PROVIDER.createCheckout).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          planId: 'pro',
          interval: 'monthly',
        })
      );
    });

    it('throws BAD_REQUEST when interval is not allowed by provider', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);

      const yearlyOnlyProvider = {
        ...MOCK_PROVIDER,
        config: { ...MOCK_PROVIDER.config, allowedIntervals: ['yearly' as const] },
      };
      asMock(getProvider).mockResolvedValue(yearlyOnlyProvider as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ ...checkoutInput, interval: 'monthly' })
      ).rejects.toThrow('only supports yearly billing');
    });

    it('creates checkout for org admin (not just owner)', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      ctx.db._chains.select.limit.mockResolvedValue([{ ...MOCK_MEMBER_OWNER, role: 'admin' }]);

      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createCheckoutSession(checkoutInput);

      expect(result.url).toBeDefined();
    });
  });

  // =========================================================================
  // createPortalSession
  // =========================================================================
  describe('createPortalSession', () => {
    it('throws PRECONDITION_FAILED when provider has no portal support', async () => {
      asMock(getProvider).mockResolvedValue({ config: { id: 'nowpayments', name: 'NOWPayments' } } as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createPortalSession({})).rejects.toThrow(
        'Portal session not supported for this provider'
      );
    });

    it('throws PRECONDITION_FAILED when provider is not found', async () => {
      asMock(getProvider).mockResolvedValue(null);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createPortalSession({})).rejects.toThrow(
        'Portal session not supported for this provider'
      );
    });

    it('throws BAD_REQUEST when no active org is selected', async () => {
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createPortalSession({})).rejects.toThrow(
        'No active organization selected'
      );
    });

    it('returns portal URL for valid org', async () => {
      asMock(getProvider).mockResolvedValue(MOCK_PROVIDER as never);

      const ctx = createMockCtx({ activeOrganizationId: ORG_ID });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createPortalSession({});

      expect(result.url).toBe('https://billing.stripe.com/session/xxx');
      expect(MOCK_PROVIDER.createPortalSession).toHaveBeenCalledWith(
        ORG_ID,
        expect.stringContaining('/dashboard/settings/billing')
      );
    });
  });

  // =========================================================================
  // getStats
  // =========================================================================
  describe('getStats', () => {
    /**
     * Helper: build a select mock that returns different rows per call index.
     *
     * The billing getStats query uses the following terminal patterns:
     *   - Query 1: .select.from.where.groupBy(col)           → groupBy is terminal
     *   - Query 2: .select.from.where.groupBy(c1, c2, c3)   → groupBy is terminal
     *   - Query 3: .select.from.where                        → where is terminal
     *   - Query 4: .select.from.orderBy.limit                → limit is terminal
     *   - Query 5: .select.from.where                        → where is terminal
     *
     * `where` must return an object with both `.groupBy` (a Promise) and the
     * object itself must be awaitable (thenable) for queries 3 & 5 where `where`
     * is the terminal. We achieve this by returning a thenable plain object.
     */
    function buildStatsDb(responses: unknown[][]) {
      let callIndex = 0;
      const selectMock = vi.fn().mockImplementation(() => {
        const rows = responses[callIndex] ?? [];
        callIndex++;

        // groupBy is the terminal for queries 1 & 2 — returns a resolved Promise
        const groupByMock = vi.fn().mockResolvedValue(rows);
        // limit is the terminal for query 4
        const limitMock = vi.fn().mockResolvedValue(rows);
        const orderByForWhereMock = vi.fn().mockReturnValue({ limit: limitMock });

        // where() returns a "thenable" object (has .then) AND has .groupBy/.orderBy/.limit
        // This allows both `await db.select.from.where(...)` and
        // `await db.select.from.where(...).groupBy(...)` to work.
        const makeWhere = () => ({
          then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
          groupBy: groupByMock,
          orderBy: orderByForWhereMock,
          limit: limitMock,
        });
        const whereMock = vi.fn().mockImplementation(makeWhere);

        // orderBy is used by query 4 (recentTransactions): .from.orderBy.limit
        const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });

        const fromMock = vi.fn().mockReturnValue({
          where: whereMock,
          orderBy: orderByMock,
        });

        return { from: fromMock };
      });

      return { select: selectMock, insert: vi.fn(), update: vi.fn(), delete: vi.fn() };
    }

    it('returns billing stats with expected shape', async () => {
      const db = buildStatsDb([
        // 1st select: planDistribution
        [{ planId: 'pro', count: 2 }, { planId: 'free', count: 5 }],
        // 2nd select: activeSubGroups for MRR
        [{ planId: 'pro', providerId: 'stripe', providerPriceId: 'price_pro_monthly', count: 2 }],
        // 3rd select: churn count
        [{ count: 1 }],
        // 4th select: recentTransactions
        [],
        // 5th select: activeDiscountCodes
        [{ count: 3 }],
      ]);

      const ctx = createMockCtx({ db });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result).toMatchObject({
        totalActiveSubscriptions: 7, // 2 pro + 5 free
        planDistribution: expect.arrayContaining([
          expect.objectContaining({ planId: 'pro', count: 2 }),
        ]),
        churnLast30Days: 1,
        recentTransactions: [],
        activeDiscountCodes: 3,
      });
      expect(typeof result.mrr).toBe('number');
    });

    it('calculates MRR correctly for monthly subscribers', async () => {
      // 2 pro monthly at $49/month = $98/month = 9800 cents
      const db = buildStatsDb([
        [{ planId: 'pro', count: 2 }],
        [{ planId: 'pro', providerId: 'stripe', providerPriceId: 'price_pro_monthly', count: 2 }],
        [{ count: 0 }],
        [],
        [{ count: 0 }],
      ]);

      const ctx = createMockCtx({ db });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result.mrr).toBe(9800); // 2 × 4900 cents
    });

    it('calculates MRR correctly for yearly subscribers (divided by 12)', async () => {
      // 1 pro yearly at $490/year → MRR = $490/12 ≈ 40.83 → 40 cents × 1
      const db = buildStatsDb([
        [{ planId: 'pro', count: 1 }],
        [{ planId: 'pro', providerId: 'stripe', providerPriceId: 'price_pro_yearly', count: 1 }],
        [{ count: 0 }],
        [],
        [{ count: 0 }],
      ]);

      const ctx = createMockCtx({ db });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      // Math.round(49000 / 12) = 4083 cents
      expect(result.mrr).toBe(Math.round(49000 / 12));
    });

    it('returns zero MRR when no active subscriptions', async () => {
      const db = buildStatsDb([
        [],  // planDistribution
        [],  // activeSubGroups
        [{ count: 0 }],
        [],
        [{ count: 0 }],
      ]);

      const ctx = createMockCtx({ db });
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getStats();

      expect(result.mrr).toBe(0);
      expect(result.totalActiveSubscriptions).toBe(0);
    });
  });
});
