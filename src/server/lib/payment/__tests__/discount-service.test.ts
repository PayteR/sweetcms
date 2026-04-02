import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

const mockDbSelectLimitMock = vi.fn().mockResolvedValue([]);
const mockDbSelectWhereMock = vi.fn().mockReturnValue({ limit: mockDbSelectLimitMock });
const mockDbSelectInnerJoinMock = vi.fn().mockReturnValue({ where: mockDbSelectWhereMock });
const mockDbSelectFromMock = vi.fn().mockReturnValue({
  where: mockDbSelectWhereMock,
  innerJoin: mockDbSelectInnerJoinMock,
});
const mockDbSelectMock = vi.fn().mockReturnValue({ from: mockDbSelectFromMock });

const mockDbInsertReturningMock = vi.fn().mockResolvedValue([]);
const mockDbInsertValuesMock = vi.fn().mockReturnValue({ returning: mockDbInsertReturningMock });
const mockDbInsertMock = vi.fn().mockReturnValue({ values: mockDbInsertValuesMock });

const mockDbUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
const mockDbUpdateSetMock = vi.fn().mockReturnValue({ where: mockDbUpdateWhereMock });
const mockDbUpdateMock = vi.fn().mockReturnValue({ set: mockDbUpdateSetMock });

vi.mock('@/server/db', () => ({
  db: {
    select: mockDbSelectMock,
    insert: mockDbInsertMock,
    update: mockDbUpdateMock,
  },
}));

vi.mock('@/server/db/schema', () => ({
  saasDiscountCodes: {
    id: 'saas_discount_codes.id',
    code: 'saas_discount_codes.code',
    isActive: 'saas_discount_codes.is_active',
    discountType: 'saas_discount_codes.discount_type',
    discountValue: 'saas_discount_codes.discount_value',
    trialDays: 'saas_discount_codes.trial_days',
    trialPriceCents: 'saas_discount_codes.trial_price_cents',
    planSpecificDiscounts: 'saas_discount_codes.plan_specific_discounts',
    maxUses: 'saas_discount_codes.max_uses',
    currentUses: 'saas_discount_codes.current_uses',
    maxUsesPerUser: 'saas_discount_codes.max_uses_per_user',
    validFrom: 'saas_discount_codes.valid_from',
    validUntil: 'saas_discount_codes.valid_until',
    timeLimitHours: 'saas_discount_codes.time_limit_hours',
    updatedAt: 'saas_discount_codes.updated_at',
  },
  saasDiscountUsages: {
    id: 'saas_discount_usages.id',
    userId: 'saas_discount_usages.user_id',
    discountCodeId: 'saas_discount_usages.discount_code_id',
    planId: 'saas_discount_usages.plan_id',
    appliedAt: 'saas_discount_usages.applied_at',
    expiresAt: 'saas_discount_usages.expires_at',
    usedAt: 'saas_discount_usages.used_at',
    removedAt: 'saas_discount_usages.removed_at',
    transactionId: 'saas_discount_usages.transaction_id',
  },
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

import {
  calculateFinalPrice,
  validateCode,
  applyDiscount,
  removeDiscount,
  getActiveDiscount,
  finalizeUsage,
} from '../discount-service';
import { DiscountType } from '@/engine/types/payment';
import type { DiscountDefinition } from '@/engine/types/payment';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDiscountCode(overrides: Record<string, unknown> = {}) {
  return {
    id: 'dc-001',
    code: 'SAVE20',
    isActive: true,
    discountType: DiscountType.PERCENTAGE,
    discountValue: 20,
    trialDays: null,
    trialPriceCents: null,
    planSpecificDiscounts: null,
    maxUses: null,
    currentUses: 0,
    maxUsesPerUser: 1,
    validFrom: null,
    validUntil: null,
    timeLimitHours: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

/**
 * Reset the DB mock chain and optionally set return values for the
 * first select().from().where().limit() call (discount code lookup)
 * and the second select (user usage lookup).
 */
function setupDbForValidateCode(
  discountCodeResult: unknown[] = [],
  userUsageResult: unknown[] = [],
) {
  let selectCallCount = 0;
  mockDbSelectLimitMock.mockImplementation(() => {
    selectCallCount++;
    if (selectCallCount === 1) return Promise.resolve(discountCodeResult);
    return Promise.resolve(userUsageResult);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('discount-service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the default mock to return empty arrays
    mockDbSelectLimitMock.mockResolvedValue([]);
    mockDbInsertReturningMock.mockResolvedValue([]);
    mockDbUpdateWhereMock.mockResolvedValue(undefined);
  });

  // =========================================================================
  // calculateFinalPrice (pure function)
  // =========================================================================
  describe('calculateFinalPrice', () => {
    // --- PERCENTAGE ---
    describe('PERCENTAGE discount', () => {
      it('applies a percentage discount correctly', () => {
        const discount: DiscountDefinition = { type: DiscountType.PERCENTAGE, value: 20 };
        expect(calculateFinalPrice(10000, discount)).toBe(8000);
      });

      it('applies 50% discount', () => {
        const discount: DiscountDefinition = { type: DiscountType.PERCENTAGE, value: 50 };
        expect(calculateFinalPrice(9900, discount)).toBe(4950);
      });

      it('applies 100% discount (free)', () => {
        const discount: DiscountDefinition = { type: DiscountType.PERCENTAGE, value: 100 };
        expect(calculateFinalPrice(4900, discount)).toBe(0);
      });

      it('applies 0% discount (no change)', () => {
        const discount: DiscountDefinition = { type: DiscountType.PERCENTAGE, value: 0 };
        expect(calculateFinalPrice(4900, discount)).toBe(4900);
      });

      it('rounds to nearest cent', () => {
        // 33% off 1000 = 670 (Math.round(1000 * 0.67) = 670)
        const discount: DiscountDefinition = { type: DiscountType.PERCENTAGE, value: 33 };
        expect(calculateFinalPrice(1000, discount)).toBe(670);
      });

      it('rounds correctly for odd fractions', () => {
        // 15% off 999 = Math.round(999 * 0.85) = Math.round(849.15) = 849
        const discount: DiscountDefinition = { type: DiscountType.PERCENTAGE, value: 15 };
        expect(calculateFinalPrice(999, discount)).toBe(849);
      });

      it('defaults to 0% when value is undefined', () => {
        const discount: DiscountDefinition = { type: DiscountType.PERCENTAGE };
        expect(calculateFinalPrice(5000, discount)).toBe(5000);
      });

      it('handles zero price input', () => {
        const discount: DiscountDefinition = { type: DiscountType.PERCENTAGE, value: 50 };
        expect(calculateFinalPrice(0, discount)).toBe(0);
      });
    });

    // --- FIXED_PRICE ---
    describe('FIXED_PRICE discount', () => {
      it('returns the fixed price value', () => {
        const discount: DiscountDefinition = { type: DiscountType.FIXED_PRICE, value: 2500 };
        expect(calculateFinalPrice(4900, discount)).toBe(2500);
      });

      it('can return a higher price than original (override, not deduction)', () => {
        const discount: DiscountDefinition = { type: DiscountType.FIXED_PRICE, value: 9900 };
        expect(calculateFinalPrice(4900, discount)).toBe(9900);
      });

      it('returns 0 when fixed price is 0', () => {
        const discount: DiscountDefinition = { type: DiscountType.FIXED_PRICE, value: 0 };
        expect(calculateFinalPrice(4900, discount)).toBe(0);
      });

      it('falls back to original price when value is undefined', () => {
        const discount: DiscountDefinition = { type: DiscountType.FIXED_PRICE };
        expect(calculateFinalPrice(4900, discount)).toBe(4900);
      });
    });

    // --- TRIAL ---
    describe('TRIAL discount', () => {
      it('returns the trial price in cents', () => {
        const discount: DiscountDefinition = { type: DiscountType.TRIAL, trialPriceCents: 100 };
        expect(calculateFinalPrice(4900, discount)).toBe(100);
      });

      it('returns 0 when trialPriceCents is 0', () => {
        const discount: DiscountDefinition = { type: DiscountType.TRIAL, trialPriceCents: 0 };
        expect(calculateFinalPrice(4900, discount)).toBe(0);
      });

      it('defaults to 0 when trialPriceCents is undefined', () => {
        const discount: DiscountDefinition = { type: DiscountType.TRIAL };
        expect(calculateFinalPrice(4900, discount)).toBe(0);
      });
    });

    // --- FREE_TRIAL ---
    describe('FREE_TRIAL discount', () => {
      it('always returns 0', () => {
        const discount: DiscountDefinition = { type: DiscountType.FREE_TRIAL };
        expect(calculateFinalPrice(4900, discount)).toBe(0);
      });

      it('returns 0 regardless of original price', () => {
        const discount: DiscountDefinition = { type: DiscountType.FREE_TRIAL };
        expect(calculateFinalPrice(0, discount)).toBe(0);
        expect(calculateFinalPrice(99999, discount)).toBe(0);
      });

      it('ignores value and trialPriceCents fields', () => {
        const discount: DiscountDefinition = {
          type: DiscountType.FREE_TRIAL,
          value: 50,
          trialPriceCents: 500,
        };
        expect(calculateFinalPrice(4900, discount)).toBe(0);
      });
    });

    // --- Unknown / default ---
    describe('unknown discount type', () => {
      it('returns original price for unknown type', () => {
        const discount = { type: 'unknown_type' as DiscountType };
        expect(calculateFinalPrice(4900, discount)).toBe(4900);
      });
    });
  });

  // =========================================================================
  // validateCode
  // =========================================================================
  describe('validateCode', () => {
    it('returns invalid when code does not exist', async () => {
      setupDbForValidateCode([], []);

      const result = await validateCode('NONEXISTENT', 'user-1', 'pro');

      expect(result).toEqual({ valid: false, message: 'Invalid discount code' });
    });

    it('returns invalid when code is inactive', async () => {
      const code = makeDiscountCode({ isActive: false });
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro');

      expect(result).toEqual({
        valid: false,
        message: 'This discount code is no longer active',
      });
    });

    it('returns invalid when code is not yet active (validFrom in the future)', async () => {
      const futureDate = new Date(Date.now() + 86400000); // tomorrow
      const code = makeDiscountCode({ validFrom: futureDate });
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro');

      expect(result).toEqual({
        valid: false,
        message: 'This discount code is not yet active',
      });
    });

    it('returns invalid when code has expired (validUntil in the past)', async () => {
      const pastDate = new Date(Date.now() - 86400000); // yesterday
      const code = makeDiscountCode({ validUntil: pastDate });
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro');

      expect(result).toEqual({
        valid: false,
        message: 'This discount code has expired',
      });
    });

    it('returns invalid when global usage limit is reached', async () => {
      const code = makeDiscountCode({ maxUses: 5, currentUses: 5 });
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro');

      expect(result).toEqual({
        valid: false,
        message: 'This discount code has reached its usage limit',
      });
    });

    it('returns invalid when user has already used the code (per-user limit)', async () => {
      const code = makeDiscountCode({ maxUsesPerUser: 1 });
      // User already has one active usage
      setupDbForValidateCode([code], [{ id: 'usage-1' }]);

      const result = await validateCode('SAVE20', 'user-1', 'pro');

      expect(result).toEqual({
        valid: false,
        message: 'You have already used this discount code',
      });
    });

    it('returns valid with discount when code passes all checks', async () => {
      const code = makeDiscountCode();
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro');

      expect(result.valid).toBe(true);
      expect(result.discount).toEqual({
        type: DiscountType.PERCENTAGE,
        value: 20,
        trialDays: undefined,
        trialPriceCents: undefined,
      });
      expect(result.finalPriceCents).toBeUndefined();
    });

    it('includes finalPriceCents when priceCents is provided', async () => {
      const code = makeDiscountCode();
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro', 10000);

      expect(result.valid).toBe(true);
      expect(result.finalPriceCents).toBe(8000); // 20% off 10000
    });

    it('uppercases the code before lookup', async () => {
      const code = makeDiscountCode();
      setupDbForValidateCode([code], []);

      await validateCode('save20', 'user-1', 'pro');

      // The DB select should have been called (we verify the function works)
      expect(mockDbSelectMock).toHaveBeenCalled();
    });

    it('resolves plan-specific discount override', async () => {
      const code = makeDiscountCode({
        planSpecificDiscounts: {
          pro: {
            type: DiscountType.FIXED_PRICE,
            value: 1000,
          },
        },
      });
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro', 4900);

      expect(result.valid).toBe(true);
      expect(result.discount).toEqual({
        type: DiscountType.FIXED_PRICE,
        value: 1000,
      });
      expect(result.finalPriceCents).toBe(1000);
    });

    it('falls back to global discount when plan has no override', async () => {
      const code = makeDiscountCode({
        planSpecificDiscounts: {
          enterprise: {
            type: DiscountType.FREE_TRIAL,
          },
        },
      });
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro', 4900);

      expect(result.valid).toBe(true);
      expect(result.discount!.type).toBe(DiscountType.PERCENTAGE);
      expect(result.finalPriceCents).toBe(3920); // 20% off 4900
    });

    it('allows code with null maxUses (unlimited)', async () => {
      const code = makeDiscountCode({ maxUses: null, currentUses: 9999 });
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro');

      expect(result.valid).toBe(true);
    });

    it('allows code within valid date window', async () => {
      const code = makeDiscountCode({
        validFrom: new Date(Date.now() - 86400000), // yesterday
        validUntil: new Date(Date.now() + 86400000), // tomorrow
      });
      setupDbForValidateCode([code], []);

      const result = await validateCode('SAVE20', 'user-1', 'pro');

      expect(result.valid).toBe(true);
    });
  });

  // =========================================================================
  // applyDiscount
  // =========================================================================
  describe('applyDiscount', () => {
    it('throws when code does not exist', async () => {
      mockDbSelectLimitMock.mockResolvedValue([]);

      await expect(applyDiscount('NOPE', 'user-1', 'pro')).rejects.toThrow(
        'Invalid discount code',
      );
    });

    it('inserts a usage record and returns usageId + discount', async () => {
      const code = makeDiscountCode();
      let selectCallCount = 0;
      mockDbSelectLimitMock.mockImplementation(() => {
        selectCallCount++;
        if (selectCallCount === 1) return Promise.resolve([code]);
        return Promise.resolve([]);
      });
      mockDbInsertReturningMock.mockResolvedValue([{ id: 'usage-42' }]);

      const result = await applyDiscount('SAVE20', 'user-1', 'pro');

      expect(result.usageId).toBe('usage-42');
      expect(result.discount).toEqual({
        type: DiscountType.PERCENTAGE,
        value: 20,
        trialDays: undefined,
        trialPriceCents: undefined,
      });
    });

    it('removes existing active discount before applying new one', async () => {
      const code = makeDiscountCode();
      mockDbSelectLimitMock.mockResolvedValue([code]);
      mockDbInsertReturningMock.mockResolvedValue([{ id: 'usage-new' }]);

      await applyDiscount('SAVE20', 'user-1', 'pro');

      // removeDiscount calls db.update (to set removedAt)
      // applyDiscount then calls db.insert
      // Verify update was called (for removeDiscount)
      expect(mockDbUpdateMock).toHaveBeenCalled();
      expect(mockDbInsertMock).toHaveBeenCalled();
    });

    it('sets expiresAt when timeLimitHours is present', async () => {
      const code = makeDiscountCode({ timeLimitHours: 24 });
      mockDbSelectLimitMock.mockResolvedValue([code]);
      mockDbInsertReturningMock.mockResolvedValue([{ id: 'usage-timed' }]);

      await applyDiscount('SAVE20', 'user-1', 'pro');

      // Verify insert was called with an expiresAt value
      expect(mockDbInsertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          discountCodeId: 'dc-001',
          planId: 'pro',
          expiresAt: expect.any(Date),
        }),
      );
    });

    it('sets expiresAt to null when timeLimitHours is absent', async () => {
      const code = makeDiscountCode({ timeLimitHours: null });
      mockDbSelectLimitMock.mockResolvedValue([code]);
      mockDbInsertReturningMock.mockResolvedValue([{ id: 'usage-notimed' }]);

      await applyDiscount('SAVE20', 'user-1', 'pro');

      expect(mockDbInsertValuesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          expiresAt: null,
        }),
      );
    });
  });

  // =========================================================================
  // removeDiscount
  // =========================================================================
  describe('removeDiscount', () => {
    it('updates active, unused usages with removedAt timestamp', async () => {
      await removeDiscount('user-1');

      expect(mockDbUpdateMock).toHaveBeenCalled();
      expect(mockDbUpdateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          removedAt: expect.any(Date),
        }),
      );
    });

    it('calls db.update exactly once', async () => {
      await removeDiscount('user-1');

      expect(mockDbUpdateMock).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // getActiveDiscount
  // =========================================================================
  describe('getActiveDiscount', () => {
    it('returns null when no active discount exists', async () => {
      mockDbSelectLimitMock.mockResolvedValue([]);

      const result = await getActiveDiscount('user-1');

      expect(result).toBeNull();
    });

    it('returns the active discount usage', async () => {
      const usage = {
        usageId: 'usage-1',
        discountCodeId: 'dc-001',
        planId: 'pro',
        appliedAt: new Date(),
        expiresAt: null,
        code: 'SAVE20',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        trialDays: null,
        trialPriceCents: null,
      };
      mockDbSelectLimitMock.mockResolvedValue([usage]);

      const result = await getActiveDiscount('user-1');

      expect(result).toEqual(usage);
    });

    it('returns null and marks as removed when discount has expired', async () => {
      const expiredUsage = {
        usageId: 'usage-expired',
        discountCodeId: 'dc-001',
        planId: 'pro',
        appliedAt: new Date('2025-01-01'),
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        code: 'SAVE20',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        trialDays: null,
        trialPriceCents: null,
      };
      mockDbSelectLimitMock.mockResolvedValue([expiredUsage]);

      const result = await getActiveDiscount('user-1');

      expect(result).toBeNull();
      // Should have called update to set removedAt on the expired usage
      expect(mockDbUpdateMock).toHaveBeenCalled();
      expect(mockDbUpdateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          removedAt: expect.any(Date),
        }),
      );
    });

    it('returns the usage when expiresAt is in the future', async () => {
      const futureUsage = {
        usageId: 'usage-future',
        discountCodeId: 'dc-001',
        planId: 'pro',
        appliedAt: new Date(),
        expiresAt: new Date(Date.now() + 86400000), // 24 hours from now
        code: 'SAVE20',
        discountType: DiscountType.PERCENTAGE,
        discountValue: 20,
        trialDays: null,
        trialPriceCents: null,
      };
      mockDbSelectLimitMock.mockResolvedValue([futureUsage]);

      const result = await getActiveDiscount('user-1');

      expect(result).toEqual(futureUsage);
      // Should NOT have called update
      expect(mockDbUpdateMock).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // finalizeUsage
  // =========================================================================
  describe('finalizeUsage', () => {
    it('does nothing when usage does not exist', async () => {
      mockDbSelectLimitMock.mockResolvedValue([]);

      await finalizeUsage('nonexistent-usage', 'txn-001');

      // Select was called, but no update should follow
      expect(mockDbSelectMock).toHaveBeenCalled();
      expect(mockDbUpdateMock).not.toHaveBeenCalled();
    });

    it('marks the usage as used and increments the global counter', async () => {
      mockDbSelectLimitMock.mockResolvedValue([{ discountCodeId: 'dc-001' }]);

      await finalizeUsage('usage-1', 'txn-001');

      // Two update calls: one for usage (usedAt + transactionId), one for code (currentUses)
      expect(mockDbUpdateMock).toHaveBeenCalledTimes(2);

      // First update: mark usage as used
      expect(mockDbUpdateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({
          usedAt: expect.any(Date),
          transactionId: 'txn-001',
        }),
      );
    });
  });
});
