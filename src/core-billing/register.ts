/**
 * core-billing module registration entrypoint.
 */

// Dependencies
export { setPaymentsDeps, getPaymentsDeps } from './deps';
export type { PaymentsDeps } from './deps';

// Routers
export { billingRouter } from './routers/billing';
export { discountCodesRouter } from './routers/discount-codes';

// Schema
export {
  saasSubscriptions,
  saasSubscriptionEvents,
  saasPaymentTransactions,
  saasDiscountCodes,
  saasDiscountUsages,
  saasTokenBalances,
  saasTokenTransactions,
} from './schema/billing';

// Types
export type {
  PlanDefinition,
  PlanFeatures,
  ProviderPriceIds,
} from './types/billing';
export { SubscriptionStatus } from './types/billing';
export {
  TransactionStatus,
  DiscountType,
} from './types/payment';
export type {
  PaymentProvider,
  PaymentProviderConfig,
  CheckoutParams,
  CheckoutResult,
  WebhookEvent,
  DiscountDefinition,
  DiscountValidationResult,
} from './types/payment';

// Lib — subscription lifecycle
export { activateSubscription, updateSubscription, cancelSubscription, getSubscription, getOrgByProviderSubscription } from './lib/subscription-service';
export { validateCode, applyDiscount, removeDiscount, finalizeUsage, getActiveDiscount } from './lib/discount-service';
export { setPlanResolver, getPlanFeatures, checkFeature, requireFeature } from './lib/feature-gate';
export { getTokenBalance, getTokenBalanceRecord, addTokens, deductTokens, getTokenTransactions } from './lib/token-service';
export { reconcileStalePendingTransactions } from './lib/reconciliation-service';

// Lib — provider factory
export { registerPaymentProvider, getProvider, getDefaultProvider, getEnabledProviders, isBillingEnabled } from './lib/factory';

// Lib — Stripe utilities
export { getStripe, requireStripe, getOrCreateStripeCustomer } from './lib/stripe';

// Lib — dunning
export { runDunningChecks } from './lib/dunning';
