import { describe, it, expect, vi, beforeEach } from 'vitest';

// Track select calls so different queries can return different results
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

const mockUpdateSet = vi.fn();
const mockUpdate = vi.fn().mockImplementation(() => ({
  set: (...args: unknown[]) => {
    mockUpdateSet(...args);
    return { where: vi.fn().mockResolvedValue(undefined) };
  },
}));

vi.mock('@/server/db', () => ({
  db: {
    select: (...args: unknown[]) => mockSelectChain(),
    insert: (...args: unknown[]) => mockInsert(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
}));

vi.mock('@/server/db/schema', () => ({
  saasSubscriptions: {
    id: 'id',
    organizationId: 'organization_id',
    stripeSubscriptionId: 'stripe_subscription_id',
  },
  saasSubscriptionEvents: {
    id: 'id',
    stripeEventId: 'stripe_event_id',
  },
}));

const mockConstructEvent = vi.fn();
const mockRetrieveSubscription = vi.fn();
vi.mock('@/server/lib/stripe', () => ({
  getStripe: vi.fn().mockReturnValue({
    webhooks: { constructEvent: (...args: unknown[]) => mockConstructEvent(...args) },
    subscriptions: { retrieve: (...args: unknown[]) => mockRetrieveSubscription(...args) },
  }),
}));

vi.mock('@/config/plans', () => ({
  getPlanByStripePriceId: vi.fn().mockReturnValue({ id: 'pro', name: 'Pro' }),
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

// Must be after vi.mock calls
import { POST } from '../route';
import { sendOrgNotification } from '@/server/lib/notifications';
import { logAudit } from '@/engine/lib/audit';

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
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test';
  });

  it('returns 400 if no stripe-signature header', async () => {
    const req = new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it('returns 400 if signature verification fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('Invalid signature');
    });
    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(400);
  });

  it('returns duplicate:true for already-processed events', async () => {
    mockConstructEvent.mockReturnValue({ id: 'evt_dup', type: 'test', data: { object: {} } });
    // Idempotency check returns existing record
    selectResults = [[{ id: 'existing-event' }]];

    const res = await POST(makeRequest('{}'));
    const body = await res.json();
    expect(body.duplicate).toBe(true);
    // Should NOT insert event log again
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('handles checkout.session.completed — upserts subscription and notifies', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { orgId: 'org-1' },
          subscription: 'sub_123',
          customer: 'cus_123',
        },
      },
    });
    mockRetrieveSubscription.mockResolvedValue({
      id: 'sub_123',
      status: 'active',
      items: {
        data: [{
          price: { id: 'price_pro_monthly' },
          current_period_start: 1700000000,
          current_period_end: 1702600000,
        }],
      },
    });
    // First select: idempotency (no duplicate)
    selectResults = [[]];

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    // Event log insert + subscription upsert
    expect(mockInsert).toHaveBeenCalledTimes(2);
    expect(logAudit).toHaveBeenCalled();
    expect(sendOrgNotification).toHaveBeenCalledWith('org-1', expect.objectContaining({
      title: 'Subscription activated',
    }));
  });

  it('handles customer.subscription.deleted — cancels and notifies', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_deleted',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_456' } },
    });
    // First select: idempotency (no duplicate)
    // Second select: orgId lookup
    selectResults = [[], [{ organizationId: 'org-2' }]];

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'canceled',
      planId: 'free',
    }));
    expect(sendOrgNotification).toHaveBeenCalledWith('org-2', expect.objectContaining({
      title: 'Subscription canceled',
    }));
  });

  it('handles invoice.payment_failed — marks past_due and notifies', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_failed',
      type: 'invoice.payment_failed',
      data: {
        object: {
          parent: {
            subscription_details: { subscription: 'sub_789' },
          },
        },
      },
    });
    // First select: idempotency (no duplicate)
    // Second select: orgId lookup
    selectResults = [[], [{ organizationId: 'org-3' }]];

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockUpdateSet).toHaveBeenCalledWith(expect.objectContaining({
      status: 'past_due',
    }));
    expect(sendOrgNotification).toHaveBeenCalledWith('org-3', expect.objectContaining({
      title: 'Payment failed',
    }));
  });

  it('skips checkout.session.completed without orgId in metadata', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_no_org',
      type: 'checkout.session.completed',
      data: { object: { metadata: {}, subscription: null } },
    });
    selectResults = [[]];

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(200);
    expect(mockRetrieveSubscription).not.toHaveBeenCalled();
    expect(sendOrgNotification).not.toHaveBeenCalled();
  });

  it('returns 500 if processing throws', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_error',
      type: 'checkout.session.completed',
      data: {
        object: {
          metadata: { orgId: 'org-1' },
          subscription: 'sub_err',
          customer: 'cus_err',
        },
      },
    });
    selectResults = [[]];
    mockRetrieveSubscription.mockRejectedValue(new Error('Stripe API error'));

    const res = await POST(makeRequest('{}'));
    expect(res.status).toBe(500);
  });
});
