import type { PaymentProvider, PaymentProviderConfig } from '@/engine/types/payment';
import { getEnabledProviderConfigs } from '@/config/payment-providers';

const providerCache = new Map<string, PaymentProvider>();

/**
 * Get a payment provider by ID. Lazy-initializes and caches instances.
 */
export function getProvider(id: string): PaymentProvider | null {
  if (providerCache.has(id)) return providerCache.get(id)!;

  let provider: PaymentProvider | null = null;

  switch (id) {
    case 'stripe': {
      if (!process.env.STRIPE_SECRET_KEY) return null;
      // Lazy import to avoid loading Stripe SDK when not needed
      const { StripeProvider } = require('./stripe-provider') as typeof import('./stripe-provider');
      provider = new StripeProvider();
      break;
    }
    case 'nowpayments': {
      if (!process.env.NOWPAYMENTS_API_KEY) return null;
      const { NowPaymentsProvider } = require('./nowpayments-provider') as typeof import('./nowpayments-provider');
      provider = new NowPaymentsProvider();
      break;
    }
    default:
      return null;
  }

  if (provider) providerCache.set(id, provider);
  return provider;
}

/**
 * Get the default (first enabled) provider.
 */
export function getDefaultProvider(): PaymentProvider | null {
  const configs = getEnabledProviderConfigs();
  if (configs.length === 0) return null;
  return getProvider(configs[0]!.id);
}

/**
 * Get all enabled provider configs (for UI provider selection).
 */
export function getEnabledProviders(): PaymentProviderConfig[] {
  return getEnabledProviderConfigs();
}

/**
 * Check if any payment provider is configured.
 */
export function isBillingEnabled(): boolean {
  return getEnabledProviderConfigs().length > 0;
}
