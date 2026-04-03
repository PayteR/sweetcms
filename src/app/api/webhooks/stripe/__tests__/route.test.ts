import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock payment factory
const mockHandleWebhook = vi.fn();
vi.mock('@/server/lib/payment/factory', () => ({
  getProvider: vi.fn().mockReturnValue({
    handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
    config: { id: 'stripe' },
  }),
}));

// Mock subscription service
const mockActivateSubscription = vi.fn().mockResolvedValue(undefined);
const mockUpdateSubscription = vi.fn().mockResolvedValue(undefined);
const mockCancelSubscription = vi.fn().mockResolvedValue(undefined);
const mockGetOrgByProviderSubscription = vi.fn().mockResolvedValue(null);
vi.mock('@/engine/lib/payment/subscription-service', () => ({
  activateSubscription: (...args: unknown[]) => mockActivateSubscription(...args),
  updateSubscription: (...args: unknown[]) => mockUpdateSubscription(...args),
  cancelSubscription: (...args: unknown[]) => mockCancelSubscription(...args),
  getOrgByProviderSubscription: (...args: unknown[]) => mockGetOrgByProviderSubscription(...args),
}));

// Track select calls for idempotency check
let selectResults: unknown[][] = [];
let selectCallIndex = 0;

function mockSelectChain() {
  return {
    from: () => ({
      where: () => ({
        limit: () => {
          const result = selectResults[selectCallIndex] ?? [];
          selectCallIndex++;
          return Promise.resolve(result);
        },
      }),
    }),
  };
}

const mockInsertValues = vi.fn();
const mockInsert = vi.fn().mockImplementation(() => ({
  values: (...args: unknown[]) => {
    mockInsertValues(...args);
    return {
      onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      returning: vi.fn().mockResolvedValue([{ id: 'notif-1' }]),
    };
  },
}));

vi.mock('@/server/db', () => ({
  db: {
    select: () => mockSelectChain(),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    }),
  },
}));

vi.mock('@/server/db/schema', () => ({
  saasSubscriptionEvents: {
    id: 'id',
    providerEventId: 'provider_event_id',
  },
}));

vi.mock('@/engine/lib/audit', () => ({
  logAudit: vi.fn(),
}));

vi.mock('@/server/lib/notifications', () => ({
  sendOrgNotification: vi.fn(),
}));

vi.mock('@/engine/types/notifications', () => ({
  NotificationType: { SUCCESS: 'success', WARNING: 'warning', ERROR: 'error' },
  NotificationCategory: { BILLING: 'billing' },
}));

vi.mock('@/engine/lib/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { POST } from '../route';
import { getProvider } from '@/server/lib/payment/factory';
import { sendOrgNotification } from '@/server/lib/notifications';
import { logAudit } from '@/engine/lib/audit';
import { asMock } from '@/test-utils';

function makeRequest(body: string, signature = 'sig_valid') {
  return new Request('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: { 'stripe-signature': signature },
  });
}

describe('Stripe webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    selectResults = [];
    selectCallIndex = 0;
  });

  it('returns 503 if stripe provider is not configured', async () => {
    asMock(getProvider).mockReturnValue(null);
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(503);
    // Restore mock
    asMock(getProvider).mockReturnValue({
      handleWebhook: mockHandleWebhook,
      config: { id: 'stripe' },
    });
  });

  it('returns 400 if webhook handling fails', async () => {
    mockHandleWebhook.mockRejectedValue(new Error('Invalid signature'));
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('returns duplicate:true for already-processed events', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      providerData: { _eventId: 'evt_dup' },
    });
    // Idempotency check returns existing record
    selectResults = [[{ id: 'existing-event' }]];

    const res = await POST(makeRequest('{}'));
    const body = await res.json();
    expect(body.duplicate).toBe(true);
  });

  it('handles subscription.activated — activates subscription and notifies', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerSubscriptionId: 'sub_123',
      providerCustomerId: 'cus_123',
      providerPriceId: 'price_pro_monthly',
      periodStart: new Date(1700000000000),
      periodEnd: new Date(1702600000000),
      providerData: { _eventId: 'evt_checkout' },
    });
    // No duplicate
    selectResults = [[]];

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockActivateSubscription).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 'org-1',
      planId: 'pro',
      providerId: 'stripe',
    }));
    expect(logAudit).toHaveBeenCalled();
    expect(sendOrgNotification).toHaveBeenCalledWith('org-1', expect.objectContaining({
      title: 'Subscription activated',
    }));
  });

  it('handles subscription.canceled — cancels and notifies', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.canceled',
      providerSubscriptionId: 'sub_456',
      status: 'canceled',
      providerData: { _eventId: 'evt_deleted' },
    });
    mockGetOrgByProviderSubscription.mockResolvedValue('org-2');
    selectResults = [[]];

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockCancelSubscription).toHaveBeenCalledWith('sub_456');
    expect(sendOrgNotification).toHaveBeenCalledWith('org-2', expect.objectContaining({
      title: 'Subscription canceled',
    }));
  });

  it('handles payment.failed — updates status and notifies', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      providerSubscriptionId: 'sub_789',
      status: 'past_due',
      providerData: { _eventId: 'evt_failed' },
    });
    mockGetOrgByProviderSubscription.mockResolvedValue('org-3');
    selectResults = [[]];

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockUpdateSubscription).toHaveBeenCalledWith('sub_789', { status: 'past_due' });
    expect(sendOrgNotification).toHaveBeenCalledWith('org-3', expect.objectContaining({
      title: 'Payment failed',
    }));
  });

  it('skips subscription.activated without organizationId', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      providerData: { _eventId: 'evt_no_org' },
    });
    selectResults = [[]];

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockActivateSubscription).not.toHaveBeenCalled();
    expect(sendOrgNotification).not.toHaveBeenCalled();
  });

  it('returns 500 if processing throws', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      providerSubscriptionId: 'sub_err',
      providerCustomerId: 'cus_err',
      providerData: { _eventId: 'evt_error' },
    });
    selectResults = [[]];
    mockActivateSubscription.mockRejectedValue(new Error('DB error'));

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
    // Restore
    mockActivateSubscription.mockResolvedValue(undefined);
  });
});
