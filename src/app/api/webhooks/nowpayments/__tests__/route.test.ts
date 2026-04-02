import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock payment factory
const mockHandleWebhook = vi.fn();
vi.mock('@/server/lib/payment/factory', () => ({
  getProvider: vi.fn().mockReturnValue({
    handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
    config: { id: 'nowpayments' },
  }),
}));

// Mock subscription service
const mockActivateSubscription = vi.fn().mockResolvedValue(undefined);
vi.mock('@/server/lib/payment/subscription-service', () => ({
  activateSubscription: (...args: unknown[]) => mockActivateSubscription(...args),
}));

// Mock db
vi.mock('@/server/db', () => ({
  db: {},
}));

// Mock audit
vi.mock('@/engine/lib/audit', () => ({
  logAudit: vi.fn(),
}));

// Mock notifications
vi.mock('@/server/lib/notifications', () => ({
  sendOrgNotification: vi.fn(),
}));

// Mock notification types
vi.mock('@/engine/types/notifications', () => ({
  NotificationType: { SUCCESS: 'success', WARNING: 'warning', ERROR: 'error' },
  NotificationCategory: { BILLING: 'billing' },
}));

// Mock logger
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

function makeRequest(body = '{}') {
  return new Request('http://localhost/api/webhooks/nowpayments', {
    method: 'POST',
    body,
  });
}

describe('NOWPayments webhook route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Restore default getProvider mock
    asMock(getProvider).mockReturnValue({
      handleWebhook: (...args: unknown[]) => mockHandleWebhook(...args),
      config: { id: 'nowpayments' },
    });
    mockActivateSubscription.mockResolvedValue(undefined);
  });

  it('returns 503 when provider is not configured', async () => {
    asMock(getProvider).mockReturnValue(null);

    const res = await POST(makeRequest());
    expect(res.status).toBe(503);

    const body = await res.json();
    expect(body.error).toBe('NOWPayments not configured');
  });

  it('returns 400 when webhook verification fails', async () => {
    mockHandleWebhook.mockRejectedValue(new Error('Invalid signature'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(400);

    const body = await res.json();
    expect(body.error).toBe('Invalid webhook');
  });

  it('processes subscription.activated: calls activateSubscription, logAudit, sendOrgNotification', async () => {
    const periodStart = new Date(1700000000000);
    const periodEnd = new Date(1702600000000);

    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerCustomerId: 'cus_np_123',
      periodStart,
      periodEnd,
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(mockActivateSubscription).toHaveBeenCalledWith({
      organizationId: 'org-1',
      planId: 'pro',
      providerId: 'nowpayments',
      interval: 'yearly',
      providerCustomerId: 'cus_np_123',
      status: 'active',
      periodStart,
      periodEnd,
    });

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'system',
      action: 'subscription.created',
      entityType: 'subscription',
      entityId: 'cus_np_123',
      metadata: expect.objectContaining({
        orgId: 'org-1',
        planId: 'pro',
        provider: 'nowpayments',
      }),
    }));

    expect(sendOrgNotification).toHaveBeenCalledWith('org-1', expect.objectContaining({
      title: 'Payment confirmed',
      type: 'success',
      category: 'billing',
      actionUrl: '/dashboard/settings/billing',
    }));
  });

  it('uses defaults when planId and providerCustomerId are missing on subscription.activated', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-2',
      status: 'active',
      periodStart: new Date(),
      periodEnd: new Date(),
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockActivateSubscription).toHaveBeenCalledWith(expect.objectContaining({
      planId: 'free',
      providerCustomerId: '',
    }));

    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      entityId: 'unknown',
    }));
  });

  it('processes payment.failed: sends error notification', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      organizationId: 'org-3',
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(sendOrgNotification).toHaveBeenCalledWith('org-3', expect.objectContaining({
      title: 'Payment failed',
      body: 'Your crypto payment has failed or expired. Please try again.',
      type: 'error',
      category: 'billing',
      actionUrl: '/dashboard/settings/billing',
    }));

    // Should not call activateSubscription for payment.failed
    expect(mockActivateSubscription).not.toHaveBeenCalled();
  });

  it('processes payment.refunded: sends warning notification', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.refunded',
      organizationId: 'org-4',
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(sendOrgNotification).toHaveBeenCalledWith('org-4', expect.objectContaining({
      title: 'Payment refunded',
      body: 'Your crypto payment has been refunded.',
      type: 'warning',
      category: 'billing',
      actionUrl: '/dashboard/settings/billing',
    }));

    // Should not call activateSubscription for payment.refunded
    expect(mockActivateSubscription).not.toHaveBeenCalled();
  });

  it('skips processing when organizationId is missing on subscription.activated', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      // no organizationId
      planId: 'pro',
      status: 'active',
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(mockActivateSubscription).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(sendOrgNotification).not.toHaveBeenCalled();
  });

  it('skips processing when organizationId is missing on payment.failed', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.failed',
      // no organizationId
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(sendOrgNotification).not.toHaveBeenCalled();
  });

  it('skips processing when organizationId is missing on payment.refunded', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'payment.refunded',
      // no organizationId
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    expect(sendOrgNotification).not.toHaveBeenCalled();
  });

  it('returns 500 when processing throws an error', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'subscription.activated',
      organizationId: 'org-1',
      planId: 'pro',
      status: 'active',
      providerCustomerId: 'cus_np_err',
      periodStart: new Date(),
      periodEnd: new Date(),
    });
    mockActivateSubscription.mockRejectedValue(new Error('DB connection failed'));

    const res = await POST(makeRequest());
    expect(res.status).toBe(500);

    const body = await res.json();
    expect(body.error).toBe('Processing failed');
  });

  it('returns 200 for unknown event types without side effects', async () => {
    mockHandleWebhook.mockResolvedValue({
      type: 'some.unknown.event',
      organizationId: 'org-5',
    });

    const res = await POST(makeRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.received).toBe(true);

    expect(mockActivateSubscription).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
    expect(sendOrgNotification).not.toHaveBeenCalled();
  });
});
