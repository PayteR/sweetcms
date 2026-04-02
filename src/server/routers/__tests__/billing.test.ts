import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock payment factory
vi.mock('@/server/lib/payment/factory', () => ({
  getProvider: vi.fn().mockReturnValue(null),
  getDefaultProvider: vi.fn().mockReturnValue(null),
  getEnabledProviders: vi.fn().mockReturnValue([]),
  isBillingEnabled: vi.fn().mockReturnValue(false),
}));

// Mock subscription service
vi.mock('@/server/lib/payment/subscription-service', () => ({
  getSubscription: vi.fn().mockResolvedValue(null),
}));

// Mock discount service
vi.mock('@/server/lib/payment/discount-service', () => ({
  validateCode: vi.fn(),
  applyDiscount: vi.fn(),
  removeDiscount: vi.fn(),
  getActiveDiscount: vi.fn().mockResolvedValue(null),
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
import { isBillingEnabled, getProvider } from '@/server/lib/payment/factory';
import { getSubscription } from '@/server/lib/payment/subscription-service';
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
    it('returns all plans without providerPrices', async () => {
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getPlans();

      expect(result).toHaveLength(PLANS.length);

      // Verify provider prices are stripped
      for (const plan of result) {
        expect(plan).not.toHaveProperty('providerPrices');
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
      asMock(getSubscription).mockResolvedValue(null);
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.getSubscription();

      expect(result).toEqual({ planId: 'free', status: 'active' });
    });

    it('returns active subscription when one exists', async () => {
      const sub = {
        id: 'sub-1',
        organizationId: 'org-1',
        providerId: 'stripe',
        providerCustomerId: 'cus_123',
        providerSubscriptionId: 'sub_123',
        providerPriceId: 'price_123',
        planId: 'pro',
        status: 'active',
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        trialEnd: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      asMock(getSubscription).mockResolvedValue(sub);
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
    it('throws when billing is not configured', async () => {
      asMock(isBillingEnabled).mockReturnValue(false);
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ planId: 'pro', interval: 'monthly' })
      ).rejects.toThrow('Billing is not configured');
    });

    it('throws when provider is not available', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockReturnValue(null);
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ planId: 'pro', interval: 'monthly', providerId: 'stripe' })
      ).rejects.toThrow('Payment provider "stripe" is not available');
    });

    it('throws when user is not org owner/admin', async () => {
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockReturnValue({
        config: { allowedIntervals: ['monthly', 'yearly'] },
      });
      const ctx = createMockCtx();
      // Member with 'member' role (not owner/admin)
      ctx.db._selectChain.limit.mockResolvedValue([{ role: 'member' }]);
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createCheckoutSession({ planId: 'pro', interval: 'monthly', providerId: 'stripe' })
      ).rejects.toThrow('Only org owners/admins can manage billing');
    });

    it('returns checkout URL on success', async () => {
      const mockProvider = {
        config: { allowedIntervals: ['monthly', 'yearly'] },
        createCheckout: vi.fn().mockResolvedValue({
          url: 'https://checkout.stripe.com/sess_123',
          providerId: 'stripe',
        }),
      };
      asMock(isBillingEnabled).mockReturnValue(true);
      asMock(getProvider).mockReturnValue(mockProvider);

      const ctx = createMockCtx();
      ctx.db._selectChain.limit.mockResolvedValue([{ role: 'owner' }]);

      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createCheckoutSession({
        planId: 'pro',
        interval: 'monthly',
        providerId: 'stripe',
      });

      expect(result).toEqual({ url: 'https://checkout.stripe.com/sess_123', providerId: 'stripe' });
    });
  });

  describe('createPortalSession', () => {
    it('throws when provider has no portal support', async () => {
      asMock(getProvider).mockReturnValue({
        config: {},
      });
      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);

      await expect(
        caller.createPortalSession({ providerId: 'nowpayments' })
      ).rejects.toThrow('Portal session not supported for this provider');
    });

    it('returns portal URL on success', async () => {
      const mockProvider = {
        config: {},
        createPortalSession: vi.fn().mockResolvedValue('https://billing.stripe.com/portal_123'),
      };
      asMock(getProvider).mockReturnValue(mockProvider);

      const ctx = createMockCtx();
      const caller = billingRouter.createCaller(ctx as never);
      const result = await caller.createPortalSession({ providerId: 'stripe' });

      expect(result).toEqual({ url: 'https://billing.stripe.com/portal_123' });
    });
  });
});
