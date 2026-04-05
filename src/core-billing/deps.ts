/**
 * core-payments dependency injection.
 *
 * Framework conventions (trpc, db, user/org/member tables, audit, core utils)
 * are imported directly. Only project-specific behavior is injected here.
 */
import type { PlanDefinition } from '@/core-payments/types/billing';
import type { PaymentProviderConfig } from '@/core-payments/types/payment';

export interface PaymentsDeps {
  /** All plan definitions for this project. */
  getPlans: () => PlanDefinition[];

  /** Get a plan by ID. */
  getPlan: (id: string) => PlanDefinition | undefined;

  /** Get a plan by provider price ID. */
  getPlanByProviderPriceId: (providerId: string, priceId: string) => PlanDefinition | undefined;

  /** Get provider price ID for a plan + interval. */
  getProviderPriceId: (plan: PlanDefinition, providerId: string, interval: 'monthly' | 'yearly') => string | null | undefined;

  /** Get enabled payment provider configs (for UI). */
  getEnabledProviderConfigs: () => PaymentProviderConfig[];

  /** Resolve the active organization ID for a user. */
  resolveOrgId: (activeOrgId: string | null, userId: string) => Promise<string>;

  /** Send a notification to all org members. Fire-and-forget. */
  sendOrgNotification: (orgId: string, params: {
    title: string;
    body: string;
    actionUrl?: string;
  }) => void;

  /** Enqueue a template email. Fire-and-forget. Returns a promise (can be caught). */
  enqueueTemplateEmail: (to: string, template: string, data: Record<string, unknown>) => Promise<void>;

  /** Broadcast a real-time event to a WebSocket channel. Fire-and-forget. */
  broadcastEvent: (channel: string, type: string, payload: Record<string, unknown>) => void;
}

let _deps: PaymentsDeps | null = null;

export function setPaymentsDeps(deps: PaymentsDeps): void {
  _deps = deps;
}

export function getPaymentsDeps(): PaymentsDeps {
  if (!_deps) {
    throw new Error(
      'Payments dependencies not configured. Call setPaymentsDeps() at startup — see src/core-payments/deps.ts',
    );
  }
  return _deps;
}
