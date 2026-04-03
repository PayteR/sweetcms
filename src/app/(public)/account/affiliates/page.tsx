'use client';

import { useState } from 'react';
import { trpc } from '@/lib/trpc/client';

export default function AffiliatesPage() {
  const [copied, setCopied] = useState(false);
  const utils = trpc.useUtils();
  const { data: affiliate, isLoading } = trpc.affiliates.getMyAffiliate.useQuery();
  const { data: stats } = trpc.affiliates.getStats.useQuery(undefined, {
    enabled: !!affiliate,
  });
  const registerMutation = trpc.affiliates.register.useMutation({
    onSuccess: () => utils.affiliates.getMyAffiliate.invalidate(),
  });

  const appUrl = typeof window !== 'undefined' ? window.location.origin : '';

  function copyLink() {
    if (!affiliate) return;
    navigator.clipboard.writeText(`${appUrl}?ref=${affiliate.code}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (isLoading) return <div className="p-8">Loading...</div>;

  if (!affiliate) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-4">Affiliate Program</h1>
        <p className="mb-6 text-(--text-secondary)">
          Earn commissions by referring new customers. Share your unique link and earn
          a percentage of every purchase made by users you refer.
        </p>
        <button
          onClick={() => registerMutation.mutate()}
          disabled={registerMutation.isPending}
          className="py-2 px-6 rounded-lg text-sm font-medium bg-(--color-brand-500) text-white hover:bg-(--color-brand-600) transition-colors disabled:opacity-50"
        >
          {registerMutation.isPending ? 'Registering...' : 'Join Affiliate Program'}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Affiliate Dashboard</h1>

      <div className="rounded-lg border border-(--border-primary) p-6 mb-6">
        <h2 className="text-sm font-medium text-(--text-secondary) mb-2">Your Referral Link</h2>
        <div className="flex items-center gap-2">
          <code className="flex-1 bg-(--surface-inset) px-3 py-2 rounded border border-(--border-secondary) text-sm overflow-x-auto">
            {appUrl}?ref={affiliate.code}
          </code>
          <button
            onClick={copyLink}
            className="py-2 px-4 rounded-lg text-sm font-medium bg-(--color-brand-500) text-white hover:bg-(--color-brand-600) transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-sm text-(--text-secondary) mt-2">
          Code: <strong>{affiliate.code}</strong>
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="rounded-lg border border-(--border-primary) p-4 text-center">
          <div className="text-2xl font-bold">{affiliate.totalReferrals}</div>
          <div className="text-sm text-(--text-secondary)">Referrals</div>
        </div>
        <div className="rounded-lg border border-(--border-primary) p-4 text-center">
          <div className="text-2xl font-bold">${(affiliate.totalEarningsCents / 100).toFixed(2)}</div>
          <div className="text-sm text-(--text-secondary)">Earnings</div>
        </div>
        <div className="rounded-lg border border-(--border-primary) p-4 text-center">
          <div className="text-2xl font-bold">{affiliate.commissionPercent}%</div>
          <div className="text-sm text-(--text-secondary)">Commission</div>
        </div>
      </div>

      {stats?.referrals && stats.referrals.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-3">Recent Referrals</h2>
          <div className="space-y-2">
            {stats.referrals.map((ref) => (
              <div
                key={ref.id}
                className="flex items-center justify-between rounded-lg border border-(--border-primary) p-3"
              >
                <span className="text-sm text-(--text-secondary)">
                  {new Date(ref.createdAt).toLocaleDateString()}
                </span>
                <span className={`text-sm px-2 py-1 rounded ${
                  ref.status === 'converted'
                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                }`}>
                  {ref.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
