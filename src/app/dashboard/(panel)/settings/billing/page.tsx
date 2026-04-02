'use client';

import { useBlankTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';

export default function BillingSettingsPage() {
  const __ = useBlankTranslations();
  const { data: subscription, isLoading } = trpc.billing.getSubscription.useQuery();
  const { data: plans } = trpc.billing.getPlans.useQuery();
  const checkout = trpc.billing.createCheckoutSession.useMutation();
  const portal = trpc.billing.createPortalSession.useMutation();

  const handleUpgrade = async (planId: string) => {
    const result = await checkout.mutateAsync({ planId, interval: 'monthly' });
    if (result.url) window.location.href = result.url;
  };

  const handleManageBilling = async () => {
    const result = await portal.mutateAsync();
    if (result.url) window.location.href = result.url;
  };

  if (isLoading) {
    return <div className="p-6">{__('Loading...')}</div>;
  }

  return (
    <div className="p-6 max-w-4xl">
      <h1 className="h2 mb-6">{__('Billing')}</h1>

      <div className="card p-6 mb-6">
        <h2 className="font-semibold mb-2">{__('Current Plan')}</h2>
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold capitalize">
            {subscription?.planId ?? 'free'}
          </span>
          <span
            className={cn(
              'badge',
              subscription?.status === 'active' ? 'badge-published' : 'badge-draft'
            )}
          >
            {subscription?.status ?? 'active'}
          </span>
        </div>
        {subscription?.planId !== 'free' && (
          <button onClick={handleManageBilling} className="btn btn-secondary btn-sm mt-4">
            {__('Manage Billing')}
          </button>
        )}
      </div>

      {plans && (
        <div className="card p-6">
          <h2 className="font-semibold mb-4">{__('Available Plans')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className="border border-(--border-primary) rounded-lg p-4"
              >
                <h3 className="font-medium">{plan.name}</h3>
                <p className="text-sm text-(--text-secondary) mt-1">
                  {plan.description}
                </p>
                <p className="text-lg font-bold mt-2">
                  ${plan.priceMonthly / 100}/mo
                </p>
                {plan.id !== subscription?.planId && plan.id !== 'free' && (
                  <button
                    onClick={() => handleUpgrade(plan.id)}
                    className="btn btn-primary btn-sm mt-3"
                    disabled={checkout.isPending}
                  >
                    {__('Upgrade')}
                  </button>
                )}
                {plan.id === subscription?.planId && (
                  <span className="inline-block mt-3 text-sm text-(--text-secondary)">
                    {__('Current plan')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
