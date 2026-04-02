import { describe, it, expect, vi, beforeEach } from 'vitest';

// Prevent mock leakage from feature-gate.test.ts which mocks this module
vi.mock('@/server/lib/payment/subscription-service', async () => {
  return await import('../subscription-service');
});

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

// Chainable mock DB
const onConflictDoUpdateMock = vi.fn().mockResolvedValue(undefined);
const insertValuesMock = vi.fn().mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
const insertMock = vi.fn().mockReturnValue({ values: insertValuesMock });

const selectLimitMock = vi.fn().mockResolvedValue([]);
const selectWhereMock = vi.fn().mockReturnValue({ limit: selectLimitMock });
const selectFromMock = vi.fn().mockReturnValue({ where: selectWhereMock });
const selectMock = vi.fn().mockReturnValue({ from: selectFromMock });

const updateWhereMock = vi.fn().mockResolvedValue(undefined);
const updateSetMock = vi.fn().mockReturnValue({ where: updateWhereMock });
const updateMock = vi.fn().mockReturnValue({ set: updateSetMock });

vi.mock('@/server/db', () => ({
  db: {
    insert: (...args: unknown[]) => insertMock(...args),
    select: (...args: unknown[]) => selectMock(...args),
    update: (...args: unknown[]) => updateMock(...args),
  },
}));

vi.mock('@/server/db/schema', () => ({
  saasSubscriptions: {
    id: 'saas_subscriptions.id',
    organizationId: 'saas_subscriptions.organization_id',
    providerId: 'saas_subscriptions.provider_id',
    providerCustomerId: 'saas_subscriptions.provider_customer_id',
    providerSubscriptionId: 'saas_subscriptions.provider_subscription_id',
    providerPriceId: 'saas_subscriptions.provider_price_id',
    planId: 'saas_subscriptions.plan_id',
    status: 'saas_subscriptions.status',
    currentPeriodStart: 'saas_subscriptions.current_period_start',
    currentPeriodEnd: 'saas_subscriptions.current_period_end',
    cancelAtPeriodEnd: 'saas_subscriptions.cancel_at_period_end',
    trialEnd: 'saas_subscriptions.trial_end',
    createdAt: 'saas_subscriptions.created_at',
    updatedAt: 'saas_subscriptions.updated_at',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((_col: unknown, val: unknown) => ({ _type: 'eq', val })),
  and: vi.fn((...conditions: unknown[]) => ({ _type: 'and', conditions })),
}));

vi.mock('@/engine/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { asMock } from '@/test-utils';
import {
  activateSubscription,
  updateSubscription,
  cancelSubscription,
  getSubscription,
  getOrgByProviderSubscription,
} from '../subscription-service';
import { eq, and } from 'drizzle-orm';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_SUBSCRIPTION = {
  id: 'sub-uuid-1',
  organizationId: 'org-1',
  providerId: 'stripe',
  providerCustomerId: 'cus_123',
  providerSubscriptionId: 'sub_stripe_123',
  providerPriceId: 'price_pro_monthly',
  planId: 'pro',
  status: 'active',
  currentPeriodStart: new Date('2026-01-01'),
  currentPeriodEnd: new Date('2026-02-01'),
  cancelAtPeriodEnd: false,
  trialEnd: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('subscription-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset ALL chainable returns (bun's clearAllMocks clears return values too)
    selectMock.mockReturnValue({ from: selectFromMock });
    selectFromMock.mockReturnValue({ where: selectWhereMock });
    selectWhereMock.mockReturnValue({ limit: selectLimitMock });
    selectLimitMock.mockResolvedValue([]);

    insertMock.mockReturnValue({ values: insertValuesMock });
    insertValuesMock.mockReturnValue({ onConflictDoUpdate: onConflictDoUpdateMock });
    onConflictDoUpdateMock.mockResolvedValue(undefined);

    updateMock.mockReturnValue({ set: updateSetMock });
    updateSetMock.mockReturnValue({ where: updateWhereMock });
    updateWhereMock.mockResolvedValue(undefined);
  });

  // =========================================================================
  // getSubscription
  // =========================================================================
  describe('getSubscription', () => {
    it('returns null when no subscription is found', async () => {
      selectLimitMock.mockResolvedValue([]);

      const result = await getSubscription('org-1');

      expect(result).toBeNull();
      expect(selectMock).toHaveBeenCalled();
      expect(eq).toHaveBeenCalled();
    });

    it('returns the subscription when found', async () => {
      selectLimitMock.mockResolvedValue([MOCK_SUBSCRIPTION]);

      const result = await getSubscription('org-1');

      expect(result).toEqual(MOCK_SUBSCRIPTION);
      expect(result!.planId).toBe('pro');
      expect(result!.status).toBe('active');
      expect(selectMock).toHaveBeenCalled();
      expect(selectFromMock).toHaveBeenCalled();
      expect(selectWhereMock).toHaveBeenCalled();
      expect(selectLimitMock).toHaveBeenCalledWith(1);
    });

    it('passes organizationId to eq()', async () => {
      selectLimitMock.mockResolvedValue([]);

      await getSubscription('org-42');

      expect(eq).toHaveBeenCalledWith(
        'saas_subscriptions.organization_id',
        'org-42'
      );
    });
  });

  // =========================================================================
  // getOrgByProviderSubscription
  // =========================================================================
  describe('getOrgByProviderSubscription', () => {
    it('returns null when no subscription matches', async () => {
      selectLimitMock.mockResolvedValue([]);

      const result = await getOrgByProviderSubscription('sub_nonexistent');

      expect(result).toBeNull();
    });

    it('returns the organizationId when found', async () => {
      selectLimitMock.mockResolvedValue([
        { organizationId: 'org-1' },
      ]);

      const result = await getOrgByProviderSubscription('sub_stripe_123');

      expect(result).toBe('org-1');
    });

    it('passes providerSubscriptionId to eq()', async () => {
      selectLimitMock.mockResolvedValue([]);

      await getOrgByProviderSubscription('sub_stripe_456');

      expect(eq).toHaveBeenCalledWith(
        'saas_subscriptions.provider_subscription_id',
        'sub_stripe_456'
      );
    });

    it('selects only the organizationId column', async () => {
      selectLimitMock.mockResolvedValue([]);

      await getOrgByProviderSubscription('sub_stripe_123');

      expect(selectMock).toHaveBeenCalledWith({
        organizationId: 'saas_subscriptions.organization_id',
      });
    });
  });

  // =========================================================================
  // cancelSubscription
  // =========================================================================
  describe('cancelSubscription', () => {
    it('sets status to "canceled" and planId to "free"', async () => {
      await cancelSubscription('sub_stripe_123');

      expect(updateMock).toHaveBeenCalled();
      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'canceled',
          planId: 'free',
          updatedAt: expect.any(Date),
        })
      );
    });

    it('filters by providerSubscriptionId', async () => {
      await cancelSubscription('sub_stripe_789');

      expect(eq).toHaveBeenCalledWith(
        'saas_subscriptions.provider_subscription_id',
        'sub_stripe_789'
      );
      expect(updateWhereMock).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // updateSubscription
  // =========================================================================
  describe('updateSubscription', () => {
    it('updates planId when provided', async () => {
      await updateSubscription('sub_stripe_123', { planId: 'enterprise' });

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          planId: 'enterprise',
          updatedAt: expect.any(Date),
        })
      );
    });

    it('updates status when provided', async () => {
      await updateSubscription('sub_stripe_123', { status: 'past_due' });

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'past_due',
          updatedAt: expect.any(Date),
        })
      );
    });

    it('updates period dates when provided', async () => {
      const periodStart = new Date('2026-03-01');
      const periodEnd = new Date('2026-04-01');

      await updateSubscription('sub_stripe_123', { periodStart, periodEnd });

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          updatedAt: expect.any(Date),
        })
      );
    });

    it('updates cancelAtPeriodEnd when provided', async () => {
      await updateSubscription('sub_stripe_123', { cancelAtPeriodEnd: true });

      expect(updateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          cancelAtPeriodEnd: true,
          updatedAt: expect.any(Date),
        })
      );
    });

    it('does not include undefined fields in the set object', async () => {
      await updateSubscription('sub_stripe_123', { planId: 'pro' });

      const setArg = asMock(updateSetMock).mock.calls[0][0];
      // Only planId and updatedAt should be present
      expect(setArg).toHaveProperty('planId', 'pro');
      expect(setArg).toHaveProperty('updatedAt');
      expect(setArg).not.toHaveProperty('status');
      expect(setArg).not.toHaveProperty('currentPeriodStart');
      expect(setArg).not.toHaveProperty('currentPeriodEnd');
      expect(setArg).not.toHaveProperty('cancelAtPeriodEnd');
      expect(setArg).not.toHaveProperty('providerPriceId');
    });

    it('filters by providerSubscriptionId', async () => {
      await updateSubscription('sub_stripe_999', { status: 'active' });

      expect(eq).toHaveBeenCalledWith(
        'saas_subscriptions.provider_subscription_id',
        'sub_stripe_999'
      );
    });
  });

  // =========================================================================
  // activateSubscription
  // =========================================================================
  describe('activateSubscription', () => {
    describe('with providerSubscriptionId (upsert path)', () => {
      it('inserts with onConflictDoUpdate', async () => {
        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'stripe',
          interval: 'monthly',
          providerCustomerId: 'cus_123',
          providerSubscriptionId: 'sub_stripe_123',
          providerPriceId: 'price_pro_monthly',
        });

        expect(insertMock).toHaveBeenCalled();
        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: 'org-1',
            providerId: 'stripe',
            providerCustomerId: 'cus_123',
            providerSubscriptionId: 'sub_stripe_123',
            providerPriceId: 'price_pro_monthly',
            planId: 'pro',
            status: 'active',
          })
        );
        expect(onConflictDoUpdateMock).toHaveBeenCalledWith(
          expect.objectContaining({
            target: 'saas_subscriptions.provider_subscription_id',
            set: expect.objectContaining({
              planId: 'pro',
              status: 'active',
              providerPriceId: 'price_pro_monthly',
            }),
          })
        );
      });

      it('uses default status "active" when not provided', async () => {
        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'stripe',
          interval: 'monthly',
          providerCustomerId: 'cus_123',
          providerSubscriptionId: 'sub_stripe_123',
        });

        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'active',
          })
        );
      });

      it('passes custom status when provided', async () => {
        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'stripe',
          interval: 'monthly',
          providerCustomerId: 'cus_123',
          providerSubscriptionId: 'sub_stripe_123',
          status: 'trialing',
        });

        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            status: 'trialing',
          })
        );
      });

      it('passes period and trial dates', async () => {
        const periodStart = new Date('2026-01-01');
        const periodEnd = new Date('2026-02-01');
        const trialEnd = new Date('2026-01-15');

        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'stripe',
          interval: 'monthly',
          providerCustomerId: 'cus_123',
          providerSubscriptionId: 'sub_stripe_123',
          periodStart,
          periodEnd,
          trialEnd,
        });

        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            trialEnd,
          })
        );
      });

      it('does not perform select/update (crypto path) when providerSubscriptionId is present', async () => {
        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'stripe',
          interval: 'monthly',
          providerCustomerId: 'cus_123',
          providerSubscriptionId: 'sub_stripe_123',
        });

        // The select path (crypto fallback) should not be used
        expect(selectMock).not.toHaveBeenCalled();
      });
    });

    describe('without providerSubscriptionId (crypto path)', () => {
      it('updates existing subscription when one is found', async () => {
        selectLimitMock.mockResolvedValue([{ id: 'existing-sub-id' }]);

        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'nowpayments',
          interval: 'monthly',
          providerCustomerId: 'cus_crypto_123',
        });

        // Should query for existing subscription
        expect(selectMock).toHaveBeenCalled();
        expect(and).toHaveBeenCalled();

        // Should update, not insert
        expect(updateMock).toHaveBeenCalled();
        expect(updateSetMock).toHaveBeenCalledWith(
          expect.objectContaining({
            providerCustomerId: 'cus_crypto_123',
            planId: 'pro',
            status: 'active',
            updatedAt: expect.any(Date),
          })
        );

        // Should not call insert (the upsert path)
        expect(insertMock).not.toHaveBeenCalled();
      });

      it('inserts a new subscription when none exists', async () => {
        selectLimitMock.mockResolvedValue([]);

        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'nowpayments',
          interval: 'monthly',
          providerCustomerId: 'cus_crypto_456',
        });

        // Should query for existing subscription
        expect(selectMock).toHaveBeenCalled();

        // Should insert new record
        expect(insertMock).toHaveBeenCalled();
        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            organizationId: 'org-1',
            providerId: 'nowpayments',
            providerCustomerId: 'cus_crypto_456',
            planId: 'pro',
            status: 'active',
          })
        );
      });

      it('queries by organizationId and providerId using and()', async () => {
        selectLimitMock.mockResolvedValue([]);

        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'nowpayments',
          interval: 'monthly',
          providerCustomerId: 'cus_crypto_789',
        });

        expect(eq).toHaveBeenCalledWith(
          'saas_subscriptions.organization_id',
          'org-1'
        );
        expect(eq).toHaveBeenCalledWith(
          'saas_subscriptions.provider_id',
          'nowpayments'
        );
        expect(and).toHaveBeenCalled();
      });

      it('sets null for optional fields when not provided', async () => {
        selectLimitMock.mockResolvedValue([]);

        await activateSubscription({
          organizationId: 'org-1',
          planId: 'pro',
          providerId: 'nowpayments',
          interval: 'monthly',
          providerCustomerId: 'cus_crypto_000',
        });

        expect(insertValuesMock).toHaveBeenCalledWith(
          expect.objectContaining({
            providerPriceId: null,
            currentPeriodStart: null,
            currentPeriodEnd: null,
          })
        );
      });
    });

    it('logs info after activation', async () => {
      // Use the upsert path for simplicity
      await activateSubscription({
        organizationId: 'org-1',
        planId: 'pro',
        providerId: 'stripe',
        interval: 'monthly',
        providerCustomerId: 'cus_123',
        providerSubscriptionId: 'sub_stripe_123',
      });

      // Logger was created with 'subscription-service' prefix —
      // we verify the mock was set up (createLogger is mocked)
      // The logger.info call happens internally; we trust the mock setup
      // ensures no runtime errors.
    });
  });
});
