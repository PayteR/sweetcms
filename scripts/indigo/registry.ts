/**
 * Module registry — maps module IDs to their git repos and metadata.
 */

export interface ModuleRegistryEntry {
  /** Module identifier (matches directory name under src/) */
  id: string;
  /** Git repo URL for subtree */
  repo: string;
  /** Variable name for the import in indigo.config.ts */
  importName: string;
  /** Dependencies (other modules that must be installed first) */
  requires?: string[];
  /** Whether this is a free module (shipped with starter) */
  free?: boolean;
  /** Short description */
  description: string;
}

export const REGISTRY: ModuleRegistryEntry[] = [
  {
    id: 'core-billing',
    repo: 'git@github.com:indigo-fw/core-billing.git',
    importName: 'coreBilling',
    free: true,
    description: 'Payment system: subscriptions, tokens, discounts, Stripe, dunning',
  },
  {
    id: 'core-billing-crypto',
    repo: 'git@github.com:indigo-fw/core-billing-crypto.git',
    importName: 'coreBillingCrypto',
    requires: ['core-billing'],
    description: 'Cryptocurrency payments via NOWPayments',
  },
  {
    id: 'core-support',
    repo: 'git@github.com:indigo-fw/core-support.git',
    importName: 'coreSupport',
    description: 'AI support chat + ticket system with escalation',
  },
  {
    id: 'core-affiliates',
    repo: 'git@github.com:indigo-fw/core-affiliates.git',
    importName: 'coreAffiliates',
    description: 'Referral tracking, attribution, affiliate management',
  },
];

export function getRegistryEntry(id: string): ModuleRegistryEntry | undefined {
  return REGISTRY.find((e) => e.id === id);
}
