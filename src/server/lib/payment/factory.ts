import type { PaymentProvider, PaymentProviderConfig } from '@/engine/types/payment';
import { getEnabledProviderConfigs } from '@/config/payment-providers';

const providerCache = new Map<string, PaymentProvider>();

/**
 * Get a payment provider by ID. Lazy-initializes and caches instances.
 */
export async function getProvider(id: string): Promise<PaymentProvider | null> {
  if (providerCache.has(id)) return providerCache.get(id)!;

  let provider: PaymentProvider | null = null;

  switch (id) {
    case 'stripe': {
      if (!process.env.STRIPE_SECRET_KEY) return null;
      const { StripeProvider } = await import('./stripe-provider');
      provider = new StripeProvider();
      break;
    }
    case 'nowpayments': {
      if (!process.env.NOWPAYMENTS_API_KEY) return null;
      const { NowPaymentsProvider } = await import('./nowpayments-provider');
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
export async function getDefaultProvider(): Promise<PaymentProvider | null> {
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
