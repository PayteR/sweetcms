import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ALL external dependencies BEFORE imports
// ---------------------------------------------------------------------------

/**
 * Makes an object thenable so it can be used in Promise.all / await.
 * Drizzle query builders are thenable.
 */
function thenable(data: unknown, chainMethods: Record<string, unknown> = {}) {
  return {
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(data).then(resolve, reject),
    ...chainMethods,
  };
}

function _createSelectChain(data: unknown) {
  const limitMock = vi.fn().mockResolvedValue(data);
  const offsetMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock }));
  const orderByMock = vi.fn().mockReturnValue(thenable(data, { limit: limitMock, offset: offsetMock }));
  const innerJoinWhereLimitMock = vi.fn().mockResolvedValue([]);
  const innerJoinWhereMock = vi.fn().mockReturnValue(thenable([], { limit: innerJoinWhereLimitMock }));
  const innerJoinMock = vi.fn().mockReturnValue(thenable([], { where: innerJoinWhereMock }));
  const whereMock = vi.fn().mockReturnValue(
    thenable(data, {
      limit: limitMock,
      orderBy: orderByMock,
      offset: offsetMock,
      innerJoin: innerJoinMock,
    })
  );
  const fromMock = vi.fn().mockReturnValue(
    thenable(data, {
      where: whereMock,
      orderBy: orderByMock,
      limit: limitMock,
      innerJoin: innerJoinMock,
    })
  );
  return { from: fromMock, _innerJoinWhereLimitMock: innerJoinWhereLimitMock };
}

// We need per-call select chains because the dunning service makes multiple sequential selects
let selectSequence: unknown[][] = [];
let selectCallIdx = 0;
// For innerJoin chains (member+user lookup), separate sequence
let innerJoinSequence: unknown[][] = [];
let innerJoinCallIdx = 0;

const mockSelectFn = vi.fn().mockImplementation(() => {
  const data = selectSequence[selectCallIdx] ?? [];
  selectCallIdx++;

  const limitMock = vi.fn().mockResolvedValue(data);
  const innerJoinWhereLimitMock = vi.fn().mockImplementation(() => {
    const ijData = innerJoinSequence[innerJoinCallIdx] ?? [];
    innerJoinCallIdx++;
    return Promise.resolve(ijData);
  });
  const innerJoinWhereMock = vi.fn().mockReturnValue(
    thenable([], { limit: innerJoinWhereLimitMock })
  );
  const innerJoinMock = vi.fn().mockReturnValue(
    thenable([], { where: innerJoinWhereMock })
  );
  const whereMock = vi.fn().mockReturnValue(
    thenable(data, {
      limit: limitMock,
      innerJoin: innerJoinMock,
    })
  );
  const fromMock = vi.fn().mockReturnValue(
    thenable(data, {
      where: whereMock,
      innerJoin: innerJoinMock,
      limit: limitMock,
    })
  );

  return { from: fromMock };
});

const mockUpdateWhereMock = vi.fn().mockResolvedValue(undefined);
const mockUpdateSetMock = vi.fn().mockReturnValue({ where: mockUpdateWhereMock });
const mockUpdateMock = vi.fn().mockReturnValue({ set: mockUpdateSetMock });

const mockDb = {
  select: mockSelectFn,
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

vi.mock('@/core/lib/logger', () => ({
  createLogger: vi.fn().mockReturnValue({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/core/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/server/lib/notifications', () => ({
  sendNotification: vi.fn(),
  sendOrgNotification: vi.fn(),
}));

vi.mock('@/core/types/notifications', () => ({
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
import { logAudit } from '@/core/lib/audit';
import { sendOrgNotification } from '@/server/lib/notifications';
import { enqueueTemplateEmail } from '@/server/jobs/email/index';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createExpiringSub(overrides: Record<string, unknown> = {}) {
  const now = new Date();
  return {
    id: 'sub-11111111-2222-4333-8444-555555555555',
    organizationId: 'org-1',
    planId: 'pro',
    providerId: 'manual',
    currentPeriodEnd: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
    ...overrides,
  };
}

function createExpiredSub(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub-aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    organizationId: 'org-2',
    planId: 'pro',
    providerId: 'manual',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dunning service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectSequence = [];
    selectCallIdx = 0;
    innerJoinSequence = [];
    innerJoinCallIdx = 0;
  });

  // =========================================================================
  // checkExpiringSubscriptions
  // =========================================================================
  describe('checkExpiringSubscriptions', () => {
    it('sends reminders for subs expiring within 7 days', async () => {
      const sub = createExpiringSub();

      // select sequence:
      // 1. expiring subs -> [sub]
      // 2. audit log check (already reminded?) -> []
      // 3. org member emails (via innerJoin chain) -> handled by innerJoinSequence
      selectSequence = [
        [sub],  // expiring subs
        [],     // not yet reminded (audit log)
      ];
      innerJoinSequence = [
        [{ email: 'admin@org.com' }],
      ];

      await checkExpiringSubscriptions();

      // Notification sent
      expect(sendOrgNotification).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          title: 'Subscription expiring soon',
          body: expect.stringContaining('Pro'),
        })
      );

      // Email sent
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

      selectSequence = [
        [sub],              // expiring subs
        [{ id: 'audit-1' }], // already reminded
      ];

      await checkExpiringSubscriptions();

      expect(sendOrgNotification).not.toHaveBeenCalled();
      expect(enqueueTemplateEmail).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('handles no expiring subs gracefully', async () => {
      selectSequence = [[]]; // no expiring subs

      await checkExpiringSubscriptions();

      expect(sendOrgNotification).not.toHaveBeenCalled();
      expect(enqueueTemplateEmail).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('skips subs with null currentPeriodEnd', async () => {
      const sub = createExpiringSub({ currentPeriodEnd: null });

      selectSequence = [[sub]];

      await checkExpiringSubscriptions();

      expect(sendOrgNotification).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // checkExpiredSubscriptions
  // =========================================================================
  describe('checkExpiredSubscriptions', () => {
    it('marks non-stripe expired subs as past_due', async () => {
      const sub = createExpiredSub({ providerId: 'manual' });

      // 1. expired subs
      selectSequence = [[sub]];
      // innerJoin: org member emails
      innerJoinSequence = [[{ email: 'admin@org.com' }]];

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
        expect.objectContaining({ planName: 'Pro' })
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

      selectSequence = [[sub]];

      await checkExpiredSubscriptions();

      expect(mockDb.update).not.toHaveBeenCalled();
      expect(sendOrgNotification).not.toHaveBeenCalled();
      expect(logAudit).not.toHaveBeenCalled();
    });

    it('handles no expired subs gracefully', async () => {
      selectSequence = [[]];

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
      selectSequence = [[], []]; // empty for both checkExpiring + checkExpired

      await expect(runDunningChecks()).resolves.toBeUndefined();
    });

    it('catches errors without re-throwing', async () => {
      // Make select throw on first call
      mockSelectFn.mockImplementationOnce(() => {
        throw new Error('DB connection lost');
      });

      await expect(runDunningChecks()).resolves.toBeUndefined();
    });
  });
});
