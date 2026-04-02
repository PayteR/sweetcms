'use client';

import { trpc } from '@/lib/trpc/client';

export default function AccountBillingPage() {
  const { data: subscription } = trpc.billing.getSubscription.useQuery();
  const portal = trpc.billing.createPortalSession.useMutation();

  const handleManage = async () => {
    const result = await portal.mutateAsync();
    if (result.url) window.location.href = result.url;
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Billing</h1>

      <div className="rounded-lg border border-(--border-primary) p-6 mb-6">
        <h2 className="font-semibold mb-2">Current Plan</h2>
        <p className="text-xl font-bold capitalize">{subscription?.planId ?? 'free'}</p>
        <p className="text-sm text-(--text-secondary) mt-1">
          Status: <span className="capitalize">{subscription?.status ?? 'active'}</span>
        </p>
      </div>

      <div className="flex gap-3">
        <a href="/pricing" className="py-2 px-4 rounded-lg text-sm font-medium bg-(--color-brand-500) text-white hover:bg-(--color-brand-600) transition-colors">
          View Plans
        </a>
        {subscription?.planId !== 'free' && (
          <button onClick={handleManage} disabled={portal.isPending} className="py-2 px-4 rounded-lg text-sm border border-(--border-primary) hover:bg-(--surface-secondary) transition-colors disabled:opacity-50">
            {portal.isPending ? 'Loading...' : 'Manage Billing'}
          </button>
        )}
      </div>
    </div>
  );
}
