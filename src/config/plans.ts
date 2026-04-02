import type { PlanDefinition } from '@/engine/types/billing';

export const PLANS: PlanDefinition[] = [
  {
    id: 'free',
    name: 'Free',
    description: 'For personal projects and trying things out',
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
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
    stripePriceIdMonthly: process.env.STRIPE_PRICE_STARTER_MONTHLY ?? '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_STARTER_YEARLY ?? '',
    priceMonthly: 1900, // $19
    priceYearly: 19000, // $190
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
    stripePriceIdMonthly: process.env.STRIPE_PRICE_PRO_MONTHLY ?? '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_PRO_YEARLY ?? '',
    priceMonthly: 4900, // $49
    priceYearly: 49000, // $490
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
    stripePriceIdMonthly: process.env.STRIPE_PRICE_ENTERPRISE_MONTHLY ?? '',
    stripePriceIdYearly: process.env.STRIPE_PRICE_ENTERPRISE_YEARLY ?? '',
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

export function getPlanByStripePriceId(priceId: string): PlanDefinition | undefined {
  return PLANS.find(
    (p) => p.stripePriceIdMonthly === priceId || p.stripePriceIdYearly === priceId
  );
}

export function getFreePlan(): PlanDefinition {
  return PLANS[0]!;
}
