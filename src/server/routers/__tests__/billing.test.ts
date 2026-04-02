import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external dependencies
vi.mock('@/server/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue(null),
  createCheckoutSession: vi.fn(),
  createPortalSession: vi.fn(),
  getActiveSubscription: vi.fn(),
}));

// Inline plan data inside factory so it works with vitest hoisting and Bun's test runner
vi.mock('@/config/plans', () => {
  const plans = [
    {
      id: 'free',
      name: 'Free',
      description: 'For personal projects and trying things out',
      stripePriceIdMonthly: null,
      stripePriceIdYearly: null,
      priceMonthly: 0,
      priceYearly: 0,
      features: { maxMembers: 1, maxStorageMb: 100, customDomain: false, apiAccess: false, prioritySupport: false },
    },
    {
      id: 'starter',
      name: 'Starter',
      description: 'For small teams getting started',
      stripePriceIdMonthly: 'price_starter_monthly',
      stripePriceIdYearly: 'price_starter_yearly',
      priceMonthly: 1900,
      priceYearly: 19000,
      features: { maxMembers: 5, maxStorageMb: 1024, customDomain: false, apiAccess: true, prioritySupport: false },
    },
    {
      id: 'pro',
      name: 'Pro',
      description: 'For growing teams that need more',
      stripePriceIdMonthly: 'price_pro_monthly',
      stripePriceIdYearly: 'price_pro_yearly',
      priceMonthly: 4900,
      priceYearly: 49000,
      features: { maxMembers: 20, maxStorageMb: 10240, customDomain: true, apiAccess: true, prioritySupport: false },
      popular: true,
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For large teams with advanced needs',
      stripePriceIdMonthly: 'price_enterprise_monthly',
      stripePriceIdYearly: 'price_enterprise_yearly',
      priceMonthly: 9900,
      priceYearly: 99000,
      features: { maxMembers: 100, maxStorageMb: 102400, customDomain: true, apiAccess: true, prioritySupport: true },
    },
  ];
  return {
    PLANS: plans,
    getPlan: (id: string) => {
      const plan = plans.find((p) => p.id === id);
      if (!plan) return undefined;
      return {
        ...plan,
        stripePriceIdMonthly: plan.stripePriceIdMonthly || `price_${id}_monthly`,
        stripePriceIdYearly: plan.stripePriceIdYearly || `price_${id}_yearly`,
      };
    },
    getPlanByStripePriceId: (priceId: string) =>
      plans.find((p) => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId),
    getFreePlan: () => plans[0],
  };
});

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

vi.mock('@/server/middleware/rate-limit', () => ({
  applyRateLimit: vi.fn().mockResolvedValue(undefined),
}));

import { asMock } from '@/test-utils';
import { billingRouter } from '../billing';
import { getStripe, getActiveSubscription, createCheckoutSession, createPortalSession } from '@/server/lib/stripe';
import { PLANS } from '@/config/plans';

// Helper to create a mock caller context
function createMockCtx(overrides: Record<string, unknown> = {}) {
  const selectFromWhereLimitMock = vi.fn().mockResolvedValue([]);
  const selectFromWhereMock = vi.fn().mockReturnValue({ limit: selectFromWhereLimitMock });
  const selectFromMock = vi.fn().mockReturnValue({ where: selectFromWhereMock });
  const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

  return {
    session: {
      user: { id: 'user-1', email: 'test@test.com', role: 'admin' },
    },
    db: {
      select: selectMock,
      _selectChain: { from: selectFromMock, where: selectFromWhereMock, limit: selectFromWhereLimitMock },
    },
    headers: new Headers(),
    activeOrganizationId: 'org-1',
    ...overrides,
  };
}

describe('billingRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getPlans', () => {
    it('returns all plans without stripe price IDs', async () => {
      const ctx = createMockCtx();

      // Call the procedure directly
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getPlans();

      expect(result).toHaveLength(PLANS.length);

      // Verify stripe IDs are stripped
      for (const plan of result) {
        expect(plan).not.toHaveProperty('stripePriceIdMonthly');
        expect(plan).not.toHaveProperty('stripePriceIdYearly');
      }
    });

    it('includes plan metadata (name, description, price, features)', async () => {
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getPlans();

      const freePlan = result.find((p) => p.id === 'free');
      expect(freePlan).toBeDefined();
      expect(freePlan!.name).toBe('Free');
      expect(freePlan!.priceMonthly).toBe(0);
      expect(freePlan!.features).toBeDefined();
      expect(freePlan!.features.maxMembers).toBe(1);
    });
  });

  describe('getSubscription', () => {
    it('returns free plan when no subscription exists', async () => {
      asMock(getActiveSubscription).mockResolvedValue(null as never);
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getSubscription();

      expect(result).toEqual({ planId: 'free', status: 'active' });
    });

    it('returns active subscription when one exists', async () => {
      const sub = {
        id: 'sub-1',
        organizationId: 'org-1',
        stripeCustomerId: 'cus_123',
        stripeSubscriptionId: 'sub_123',
        stripePriceId: 'price_123',
        planId: 'pro',
        status: 'active',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      asMock(getActiveSubscription).mockResolvedValue(sub);
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getSubscription();

      expect(result).toEqual(sub);
    });

    it('throws when no active organization is set', async () => {
      const ctx = createMockCtx({ activeOrganizationId: null });
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.getSubscription()).rejects.toThrow(
        'No active organization selected'
      );
    });
  });

  describe('createCheckoutSession', () => {
    it('throws when Stripe is not configured', async () => {
      asMock(getStripe).mockReturnValue(null);
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ planId: 'pro', interval: 'monthly' })
      ).rejects.toThrow('Billing is not configured');
    });

    it('throws when plan not found', async () => {
      asMock(getStripe).mockReturnValue({} as never);
      const ctx = createMockCtx();
      // Mock member lookup to return owner
      ctx.db._selectChain.limit.mockResolvedValue([{ role: 'owner' }]);
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ planId: 'nonexistent', interval: 'monthly' })
      ).rejects.toThrow('Plan not found');
    });

    it('throws when user is not org owner/admin', async () => {
      asMock(getStripe).mockReturnValue({} as never);
      const ctx = createMockCtx();
      // Member with 'member' role (not owner/admin)
      ctx.db._selectChain.limit.mockResolvedValue([{ role: 'member' }]);
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ planId: 'pro', interval: 'monthly' })
      ).rejects.toThrow('Only org owners/admins can manage billing');
    });

    it('returns checkout URL on success', async () => {
      asMock(getStripe).mockReturnValue({} as never);
      asMock(createCheckoutSession).mockResolvedValue('https://checkout.stripe.com/sess_123');

      const ctx = createMockCtx();
      ctx.db._selectChain.limit.mockResolvedValue([{ role: 'owner' }]);

      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createCheckoutSession({
        planId: 'pro',
        interval: 'monthly',
      });

      expect(result).toEqual({ url: 'https://checkout.stripe.com/sess_123' });
    });
  });

  describe('createPortalSession', () => {
    it('throws when Stripe is not configured', async () => {
      asMock(getStripe).mockReturnValue(null);
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);

      await expect(caller.createPortalSession()).rejects.toThrow(
        'Billing is not configured'
      );
    });

    it('returns portal URL on success', async () => {
      asMock(getStripe).mockReturnValue({} as never);
      asMock(createPortalSession).mockResolvedValue('https://billing.stripe.com/portal_123');

      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createPortalSession();

      expect(result).toEqual({ url: 'https://billing.stripe.com/portal_123' });
    });
  });
});
