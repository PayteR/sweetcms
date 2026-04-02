export enum SubscriptionStatus {
  ACTIVE = 'active',
  TRIALING = 'trialing',
  PAST_DUE = 'past_due',
  CANCELED = 'canceled',
  UNPAID = 'unpaid',
  INCOMPLETE = 'incomplete',
  INCOMPLETE_EXPIRED = 'incomplete_expired',
  PAUSED = 'paused',
}

export interface PlanFeatures {
  /** Max team members per org */
  maxMembers: number;
  /** Max storage in MB */
  maxStorageMb: number;
  /** Custom domain support */
  customDomain: boolean;
  /** API access */
  apiAccess: boolean;
  /** Priority support */
  prioritySupport: boolean;
  /** Extend per-project */
  [key: string]: unknown;
}

export interface PlanDefinition {
  id: string;
  name: string;
  description: string;
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
  priceMonthly: number; // in cents
  priceYearly: number; // in cents
  features: PlanFeatures;
  popular?: boolean;
}
