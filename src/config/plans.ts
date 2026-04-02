import type { PlanDefinition, ProviderPriceIds } from '@/engine/types/billing';

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For personal projects and trying things out',
    providerPrices: {},
    priceMonthly: 0,
    priceYearly: 0,
    features: {
      maxMembers: 1,
      maxStorageMb: 100,
      customDomain: false,
      apiAccess: false,
      prioritySupport: false,
    },
  },
  {
    id: 'starter',
    name: 'Starter',
    description: 'For small teams getting started',
    providerPrices: {
      stripe: {
        monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
        yearly: process.env.STRIPE_PRICE_STARTER_YEARLY ?? '',
      },
      nowpayments: { yearly: process.env.STRIPE_PRICE_STARTER_YEARLY ? '' : undefined },
    },
    priceMonthly: 1900, // $19
    priceYearly: 19000, // $190
    trialDays: 14,
    features: {
      maxMembers: 5,
      maxStorageMb: 1024,
      customDomain: false,
      apiAccess: true,
      prioritySupport: false,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'For growing teams that need more',
    providerPrices: {
      stripe: {
        monthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
        yearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? '',
      },
      nowpayments: { yearly: process.env.STRIPE_PRICE_PRO_YEARLY ? '' : undefined },
    },
    priceMonthly: 4900, // $49
    priceYearly: 49000, // $490
    trialDays: 14,
    features: {
      maxMembers: 20,
      maxStorageMb: 10240,
      customDomain: true,
      apiAccess: true,
      prioritySupport: false,
    },
    popular: true,
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'For large teams with advanced needs',
    providerPrices: {
      stripe: {
        monthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
        yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY ?? '',
      },
      nowpayments: { yearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY ? '' : undefined },
    },
    priceMonthly: 9900, // $99
    priceYearly: 99000, // $990
    features: {
      maxMembers: 100,
      maxStorageMb: 102400,
      customDomain: true,
      apiAccess: true,
      prioritySupport: true,
    },
  },
];

export function getPlan(id: string): PlanDefinition | undefined {
  return PLANS.find((p) => p.id === id);
}

/** Look up a plan by provider-specific price ID */
export function getPlanByProviderPriceId(
  providerId: string,
  priceId: string
): PlanDefinition | undefined {
  return PLANS.find((p) => {
    const prices = p.providerPrices[providerId];
    if (!prices || typeof prices === 'boolean') return false;
    return (prices as ProviderPriceIds).monthly === priceId || (prices as ProviderPriceIds).yearly === priceId;
  });
}

/** Get the price ID for a plan + provider + interval */
export function getProviderPriceId(
  plan: PlanDefinition,
  providerId: string,
  interval: 'monthly' | 'yearly'
): string | null {
  const prices = plan.providerPrices[providerId];
  if (!prices || typeof prices === 'boolean') return null;
  return (prices as ProviderPriceIds)[interval] ?? null;
}

export function getFreePlan(): PlanDefinition {
  return PLANS[0]!;
}
