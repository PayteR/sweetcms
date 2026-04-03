import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

const mockSelectLimitMock = vi.fn().mockResolvedValue([]);
const mockSelectOffsetMock = vi.fn().mockReturnValue({ limit: mockSelectLimitMock });
const mockSelectOrderByMock = vi.fn().mockReturnValue({ limit: mockSelectLimitMock, offset: mockSelectOffsetMock });
const mockSelectInnerJoinWhereLimitMock = vi.fn().mockResolvedValue([]);
const mockSelectInnerJoinWhereMock = vi.fn().mockReturnValue({ limit: mockSelectInnerJoinWhereLimitMock });
const mockSelectInnerJoinMock = vi.fn().mockReturnValue({ where: mockSelectInnerJoinWhereMock });
const mockSelectWhereMock = vi.fn().mockReturnValue({
  limit: mockSelectLimitMock,
  orderBy: mockSelectOrderByMock,
  offset: mockSelectOffsetMock,
});
const mockSelectFromMock = vi.fn().mockReturnValue({
  where: mockSelectWhereMock,
  innerJoin: mockSelectInnerJoinMock,
  orderBy: mockSelectOrderByMock,
  limit: mockSelectLimitMock,
});
const mockSelectMock = vi.fn().mockReturnValue({ from: mockSelectFromMock });

const mockUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
const mockUpdateSetMock = vi.fn().mockReturnValue({ where: mockUpdateWhereMock });
const mockUpdateMock = vi.fn().mockReturnValue({ set: mockUpdateSetMock });

const mockDb = {
  select: mockSelectMock,
  update: mockUpdateMock,
};

vi.mock('@/server/db', () => ({
  db: mockDb,
}));

vi.mock('@/server/db/schema/billing', () => ({
  saasSubscriptions: {
    id: 'saas_subscriptions.id',
    organizationId: 'saas_subscriptions.organization_id',
    planId: 'saas_subscriptions.plan_id',
    providerId: 'saas_subscriptions.provider_id',
    status: 'saas_subscriptions.status',
    currentPeriodEnd: 'saas_subscriptions.current_period_end',
    updatedAt: 'saas_subscriptions.updated_at',
  },
}));

vi.mock('@/server/db/schema/organization', () => ({
  member: {
    userId: 'member.user_id',
    organizationId: 'member.organization_id',
  },
}));

vi.mock('@/server/db/schema/auth', () => ({
  user: {
    id: 'user.id',
    email: 'user.email',
  },
}));

vi.mock('@/server/db/schema/audit', () => ({
  cmsAuditLog: {
    id: 'cms_audit_log.id',
    action: 'cms_audit_log.action',
    entityId: 'cms_audit_log.entity_id',
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

vi.mock('@/engine/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/server/lib/notifications', () => ({
  sendNotification: vi.fn(),
  sendOrgNotification: vi.fn(),
}));

vi.mock('@/engine/types/notifications', () => ({
  NotificationType: { INFO: 'info', SUCCESS: 'success', WARNING: 'warning', ERROR: 'error' },
  NotificationCategory: { BILLING: 'billing', ORGANIZATION: 'organization', CONTENT: 'content', SYSTEM: 'system', SECURITY: 'security' },
}));

vi.mock('@/config/plans', () => ({
  getPlan: vi.fn().mockReturnValue({ name: 'Pro', priceMonthly: 2900, priceYearly: 29000 }),
}));

vi.mock('@/server/jobs/email/index', () => ({
  enqueueTemplateEmail: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { checkExpiringSubscriptions, checkExpiredSubscriptions, runDunningChecks } from '../dunning';
import { logAudit } from '@/engine/lib/audit';
import { sendOrgNotification } from '@/server/lib/notifications';
import { enqueueTemplateEmail } from '@/server/jobs/email/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createExpiringSub(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'sub-1111-2222-3333-444444444444',
    organizationId: 'org-1',
    planId: 'pro',
    providerId: 'manual',
    currentPeriodEnd: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    ...overrides,
  };
}

function createExpiredSub(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'sub-expired-2222-3333-444444444444',
    organizationId: 'org-2',
    planId: 'pro',
    providerId: 'manual',
    currentPeriodEnd: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // 1 day ago
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dunning service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all DB mock chains to default empty returns
    mockSelectLimitMock.mockResolvedValue([]);
    mockSelectInnerJoinWhereLimitMock.mockResolvedValue([]);
    mockUpdateWhereMock.mockResolvedValue(undefined);
  });

  // =========================================================================
  // checkExpiringSubscriptions
  // =========================================================================
  describe('checkExpiringSubscriptions', () => {
    it('sends reminders for subs expiring within 7 days', async () => {
      const sub = createExpiringSub();

      // Call sequence:
      // 1. Select expiring subs -> returns [sub]
      // 2. Check audit log (already reminded?) -> returns [] (not reminded)
      // 3. Select org member emails -> returns admin email
      let selectCallIdx = 0;
      mockSelectLimitMock.mockImplementation(() => {
        selectCallIdx++;
        if (selectCallIdx === 1) return Promise.resolve([sub]);
        if (selectCallIdx === 2) return Promise.resolve([]); // not yet reminded
        return Promise.resolve([]);
      });
      mockSelectInnerJoinWhereLimitMock.mockResolvedValue([
        { email: 'admin@org.com' },
      ]);

      await checkExpiringSubscriptions();

      // Notification sent
      expect(sendOrgNotification).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          title: 'Subscription expiring soon',
          body: expect.stringContaining('Pro'),
        })
      );

      // Email sent to org admin
      expect(enqueueTemplateEmail).toHaveBeenCalledWith(
        'admin@org.com',
        'subscription-expiring',
        expect.objectContaining({
          planName: 'Pro',
          daysLeft: expect.any(String),
        })
      );

      // Audit logged
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
          action: 'dunning.expiring',
          entityType: 'subscription',
          entityId: sub.id,
        })
      );
    });

    it('skips already-reminded subs', async () => {
      const sub = createExpiringSub();

      // First: expiring subs, Second: audit log check returns existing entry
      let selectCallIdx = 0;
      mockSelectLimitMock.mockImplementation(() => {
        selectCallIdx++;
        if (selectCallIdx === 1) return Promise.resolve([sub]);
        if (selectCallIdx === 2) return Promise.resolve([{ id: 'audit-entry' }]); // already reminded
        return Promise.resolve([]);
      });

      await checkExpiringSubscriptions();

      // No notification should be sent since already reminded
      expect(sendOrgNotification).not.toHaveBeenCalled();
      expect(enqueueTemplateEmail).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('handles no expiring subs gracefully', async () => {
      // Select returns no expiring subscriptions
      mockSelectLimitMock.mockResolvedValue([]);

      await checkExpiringSubscriptions();

      // No notifications, no emails, no audit
      expect(sendOrgNotification).not.toHaveBeenCalled();
      expect(enqueueTemplateEmail).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('skips subs with null currentPeriodEnd', async () => {
      const sub = createExpiringSub({ currentPeriodEnd: null });

      mockSelectLimitMock.mockResolvedValueOnce([sub]);

      await checkExpiringSubscriptions();

      // Should skip due to null check
      expect(sendOrgNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // checkExpiredSubscriptions
  // =========================================================================
  describe('checkExpiredSubscriptions', () => {
    it('marks non-stripe expired subs as past_due', async () => {
      const sub = createExpiredSub({ providerId: 'manual' });

      // First select: expired subs
      let selectCallIdx = 0;
      mockSelectLimitMock.mockImplementation(() => {
        selectCallIdx++;
        if (selectCallIdx === 1) return Promise.resolve([sub]);
        return Promise.resolve([]);
      });
      mockSelectInnerJoinWhereLimitMock.mockResolvedValue([
        { email: 'admin@org.com' },
      ]);

      await checkExpiredSubscriptions();

      // Subscription marked as past_due
      expect(mockDb.update).toHaveBeenCalled();
      expect(mockUpdateSetMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'past_due' })
      );

      // Notification sent
      expect(sendOrgNotification).toHaveBeenCalledWith(
        'org-2',
        expect.objectContaining({
          title: 'Subscription expired',
          body: expect.stringContaining('Pro'),
        })
      );

      // Email sent
      expect(enqueueTemplateEmail).toHaveBeenCalledWith(
        'admin@org.com',
        'subscription-expired',
        expect.objectContaining({
          planName: 'Pro',
        })
      );

      // Audit logged
      expect(logAudit).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'system',
          action: 'dunning.expired',
          entityType: 'subscription',
          entityId: sub.id,
        })
      );
    });

    it('skips stripe subs (stripe handles own lifecycle)', async () => {
      const sub = createExpiredSub({ providerId: 'stripe' });

      mockSelectLimitMock.mockResolvedValueOnce([sub]);

      await checkExpiredSubscriptions();

      // No update — stripe handles its own
      expect(mockDb.update).not.toHaveBeenCalled();
      expect(sendOrgNotification).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('handles no expired subs gracefully', async () => {
      mockSelectLimitMock.mockResolvedValue([]);

      await checkExpiredSubscriptions();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(sendOrgNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // runDunningChecks
  // =========================================================================
  describe('runDunningChecks', () => {
    it('calls both check functions without throwing', async () => {
      // Both selects return empty
      mockSelectLimitMock.mockResolvedValue([]);

      await expect(runDunningChecks()).resolves.toBeUndefined();
    });

    it('catches errors without re-throwing', async () => {
      // Make the first select call throw
      mockSelectLimitMock.mockRejectedValueOnce(new Error('DB connection lost'));

      // runDunningChecks catches errors — should not throw
      await expect(runDunningChecks()).resolves.toBeUndefined();
    });
  });
});
