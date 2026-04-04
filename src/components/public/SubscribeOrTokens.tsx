'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';
import { TokenBalance } from '@/engine/components/TokenBalance';

/**
 * Shows a "Subscribe" button if the user has no active subscription,
 * or the live token balance if they do. Hidden when not logged in.
 */
export function SubscribeOrTokens() {
  const { data: session } = useSession();
  const { data: subscription, isLoading } = trpc.billing.getSubscription.useQuery(
    undefined,
    { enabled: !!session },
  );

  // Not logged in — nothing to show
  if (!session) return null;

  // Loading
  if (isLoading) return null;

  // Has active subscription — show token balance
  if (subscription?.status === 'active' || subscription?.status === 'trialing') {
    return <TokenBalance href="/account/billing" />;
  }

  // No subscription — show Subscribe button
  return (
    <Link
      href="/pricing"
      className="flex items-center gap-1.5 rounded-lg bg-(--color-brand-500) px-3 py-1.5 text-sm font-medium text-white hover:bg-(--color-brand-600) transition-colors"
    >
      <Sparkles className="h-3.5 w-3.5" />
      Subscribe
    </Link>
  );
}
