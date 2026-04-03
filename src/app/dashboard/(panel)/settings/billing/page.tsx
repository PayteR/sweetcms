'use client';

import { useRef, useState, useEffect, useMemo } from 'react';
import { useBlankTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';
import { cn } from '@/lib/utils';
import { SubscriptionSummary } from './components/SubscriptionSummary';
import { SubscriptionsTable } from './components/SubscriptionsTable';
import { ChurnedSubscriptionsTable } from './components/ChurnedSubscriptionsTable';
import { DiscountCodesTable } from './components/DiscountCodesTable';
import { RevenueChart } from './components/RevenueChart';

const DATE_PRESETS = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '180 days', days: 180 },
  { label: '1 year', days: 365 },
  { label: 'All time', days: 0 },
] as const;

function toISOStart(date: Date): string {
  return new Date(date.setHours(0, 0, 0, 0)).toISOString();
}

function toISOEnd(date: Date): string {
  return new Date(date.setHours(23, 59, 59, 999)).toISOString();
}

export default function BillingDashboardPage() {
  const __ = useBlankTranslations();

  // ─── Sticky filter bar ────────────────────────────────────────────────────
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [isStuck, setIsStuck] = useState(false);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setIsStuck(!entry.isIntersecting);
      },
      { threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  // ─── Date range filter ────────────────────────────────────────────────────
  const [preset, setPreset] = useState(30);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const isCustom = preset === -1;

  const { from, to } = useMemo(() => {
    if (isCustom) {
      return {
        from: customFrom ? toISOStart(new Date(customFrom)) : undefined,
        to: customTo ? toISOEnd(new Date(customTo)) : undefined,
      };
    }
    if (preset === 0) return { from: undefined, to: undefined }; // All time
    const now = new Date();
    const start = new Date(now.getTime() - preset * 24 * 60 * 60 * 1000);
    return { from: toISOStart(start), to: toISOEnd(now) };
  }, [preset, customFrom, customTo, isCustom]);

  // ─── Summary data ─────────────────────────────────────────────────────────
  const { data: summary, isLoading: summaryLoading } = trpc.billing.getSummary.useQuery({ from, to });

  // ─── Customer-facing subscription (for self-service section) ──────────────
  const { data: subscription } = trpc.billing.getSubscription.useQuery();
  const { data: plans } = trpc.billing.getPlans.useQuery();
  const checkout = trpc.billing.createCheckoutSession.useMutation();
  const portal = trpc.billing.createPortalSession.useMutation();

  const handleUpgrade = async (planId: string) => {
    const result = await checkout.mutateAsync({ planId, interval: 'monthly' });
    if (result.url) window.location.href = result.url;
  };

  const handleManageBilling = async () => {
    const result = await portal.mutateAsync({ providerId: 'stripe' });
    if (result.url) window.location.href = result.url;
  };

  return (
    <div className="mx-auto max-w-320">
      {/* Page header */}
      <div className="mb-6">
        <h1 className="h2">{__('Subscriptions')}</h1>
        <p className="mt-1 text-sm text-(--text-secondary)">
          {__('Manage subscriptions, monitor revenue, and track churn.')}
        </p>
      </div>

      {/* Sentinel for sticky detection */}
      <div ref={sentinelRef} className="h-0" />

      {/* Sticky filter bar */}
      <div
        className={cn(
          'sticky top-0 z-50 -mx-6 px-6 py-3 flex flex-wrap items-center gap-3',
          'transition-[background-color,border-color] duration-200',
          isStuck
            ? 'bg-(--surface-primary) border-b border-b-(--border-primary) shadow-sm'
            : 'border-b border-transparent'
        )}
      >
        {/* Date preset selector */}
        <select
          value={preset}
          onChange={(e) => {
            const v = Number(e.target.value);
            setPreset(v);
          }}
          className="filter-select"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.days} value={p.days}>
              {__(p.label)}
            </option>
          ))}
          <option value={-1}>{__('Custom range')}</option>
        </select>

        {/* Custom date inputs */}
        {isCustom && (
          <>
            <label className="text-sm text-(--text-secondary)">{__('From')}</label>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="filter-select"
            />
            <label className="text-sm text-(--text-secondary)">{__('To')}</label>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="filter-select"
            />
          </>
        )}

        <div className="flex-1" />

        {/* Active range display */}
        {!isCustom && preset > 0 && (
          <span className="text-xs text-(--text-muted)">
            {__('Last')} {preset} {__('days')}
          </span>
        )}
        {!isCustom && preset === 0 && (
          <span className="text-xs text-(--text-muted)">{__('All time')}</span>
        )}
      </div>

      {/* Summary KPIs */}
      <div className="mt-6">
        <SubscriptionSummary data={summary} isLoading={summaryLoading} />
      </div>

      {/* Revenue chart */}
      <div className="mt-6">
        <RevenueChart from={from} to={to} />
      </div>

      {/* Subscriptions list */}
      <div className="mt-6">
        <div className="widget-header">
          <h2 className="font-semibold text-(--text-primary)">{__('Active Subscriptions')}</h2>
        </div>
        <SubscriptionsTable from={from} to={to} />
      </div>

      {/* Churned subscriptions */}
      <div className="mt-6">
        <div className="widget-header">
          <h2 className="font-semibold text-(--text-primary)">{__('Churned Subscriptions')}</h2>
        </div>
        <ChurnedSubscriptionsTable from={from} to={to} />
      </div>

      {/* Discount codes overview */}
      <div className="mt-6">
        <DiscountCodesTable />
      </div>

      {/* Self-service billing section */}
      <div className="mt-8 mb-6">
        <div className="widget-header">
          <h2 className="font-semibold text-(--text-primary)">{__('Your Organization Billing')}</h2>
        </div>
        <div className="card p-6 mt-2">
          <div className="flex items-center gap-3 mb-4">
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
            <button onClick={handleManageBilling} className="btn btn-secondary btn-sm">
              {__('Manage Billing')}
            </button>
          )}
        </div>

        {plans && (
          <div className="card p-6 mt-4">
            <h3 className="font-semibold mb-4">{__('Available Plans')}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="border border-(--border-primary) rounded-lg p-4"
                >
                  <h4 className="font-medium">{plan.name}</h4>
                  <p className="text-sm text-(--text-secondary) mt-1">{plan.description}</p>
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
    </div>
  );
}
