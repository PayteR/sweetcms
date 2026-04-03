'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';

interface SubscriptionsTableProps {
  from?: string;
  to?: string;
}

const PLAN_NAMES: Record<string, string> = {
  free: 'Free',
  starter: 'Starter',
  pro: 'Pro',
  enterprise: 'Enterprise',
};

const STATUS_OPTIONS = ['active', 'trialing', 'past_due', 'canceled', 'unpaid'] as const;

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'active':
      return 'badge badge-published';
    case 'trialing':
      return 'badge badge-scheduled';
    case 'canceled':
    case 'unpaid':
      return 'badge badge-draft';
    case 'past_due':
      return 'badge';
    default:
      return 'badge';
  }
}

export function SubscriptionsTable({ from, to }: SubscriptionsTableProps) {
  const __ = useBlankTranslations();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState('');
  const [planId, setPlanId] = useState('');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [debouncedSearch, status, planId, pageSize, from, to]);

  const { data, isLoading } = trpc.billing.listSubscriptions.useQuery({
    page,
    pageSize,
    status: status || undefined,
    planId: planId || undefined,
    from: from || undefined,
    to: to || undefined,
    search: debouncedSearch || undefined,
  });

  const results = data?.results ?? [];
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;
  const showFrom = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const showTo = Math.min(page * pageSize, total);

  return (
    <div className="card p-0">
      {/* Filters */}
      <div className={cn('flex flex-wrap items-center gap-3 p-4 border-b border-[var(--border-default)]')}>
        <input
          type="text"
          className="search-input"
          placeholder={__('Search organizations...')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="filter-select"
          value={planId}
          onChange={(e) => setPlanId(e.target.value)}
        >
          <option value="">{__('All Plans')}</option>
          {Object.entries(PLAN_NAMES).map(([id, name]) => (
            <option key={id} value={id}>{__(name)}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">{__('All Statuses')}</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{__(s.charAt(0).toUpperCase() + s.slice(1).replace('_', ' '))}</option>
          ))}
        </select>
        <select
          className="filter-select"
          value={pageSize}
          onChange={(e) => setPageSize(Number(e.target.value))}
        >
          {[10, 20, 50].map((n) => (
            <option key={n} value={n}>{n} {__('per page')}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="p-8 text-center text-[var(--text-muted)]">{__('Loading...')}</div>
      ) : results.length === 0 ? (
        <div className="empty-state">{__('No subscriptions found.')}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Organization')}</th>
                <th className="th">{__('Plan')}</th>
                <th className="th">{__('Status')}</th>
                <th className="th">{__('Provider')}</th>
                <th className="th">{__('Period')}</th>
                <th className="th">{__('Created')}</th>
              </tr>
            </thead>
            <tbody>
              {results.map((sub) => (
                <tr key={sub.id} className="tr">
                  <td className="td">{sub.orgName ?? sub.organizationId}</td>
                  <td className="td">{PLAN_NAMES[sub.planId] ?? sub.planId}</td>
                  <td className="td">
                    <span
                      className={statusBadgeClass(sub.status)}
                      style={sub.status === 'past_due' ? { backgroundColor: 'oklch(0.75 0.15 70)', color: '#fff' } : undefined}
                    >
                      {__(sub.status.charAt(0).toUpperCase() + sub.status.slice(1).replace('_', ' '))}
                    </span>
                  </td>
                  <td className="td">{sub.providerId ?? '—'}</td>
                  <td className="td">
                    {sub.currentPeriodStart && sub.currentPeriodEnd
                      ? `${new Date(sub.currentPeriodStart).toLocaleDateString()} – ${new Date(sub.currentPeriodEnd).toLocaleDateString()}`
                      : '—'}
                  </td>
                  <td className="td">
                    {sub.createdAt ? new Date(sub.createdAt).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="pagination">
          <span className="text-sm text-[var(--text-muted)]">
            {__('Showing')} {showFrom} {__('to')} {showTo} {__('of')} {total} {__('results')}
          </span>
          <div className="flex gap-2">
            <button
              className="btn btn-secondary btn-sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {__('Previous')}
            </button>
            <button
              className="btn btn-secondary btn-sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {__('Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
