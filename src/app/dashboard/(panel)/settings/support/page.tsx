'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2 } from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { adminPanel } from '@/config/routes';
import { cn } from '@/lib/utils';

const STATUSES = ['open', 'awaiting_user', 'awaiting_admin', 'resolved', 'closed'] as const;
const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;

const STATUS_LABELS: Record<string, string> = {
  open: 'Open',
  awaiting_user: 'Awaiting User',
  awaiting_admin: 'Awaiting Admin',
  resolved: 'Resolved',
  closed: 'Closed',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
  urgent: 'Urgent',
};

const PRIORITY_COLORS: Record<string, string> = {
  low: '',
  normal: '',
  high: 'text-amber-600 dark:text-amber-400',
  urgent: 'text-red-600 dark:text-red-400 font-semibold',
};

export default function AdminSupportPage() {
  const __ = useBlankTranslations();
  const [statusFilter, setStatusFilter] = useState<string | undefined>(undefined);
  const [priorityFilter, setPriorityFilter] = useState<string | undefined>(undefined);
  const [page, setPage] = useState(1);

  const { data: stats } = trpc.support.getStats.useQuery();
  const { data, isLoading } = trpc.support.adminList.useQuery({
    status: statusFilter as (typeof STATUSES)[number] | undefined,
    priority: priorityFilter as (typeof PRIORITIES)[number] | undefined,
    page,
    pageSize: 20,
  });

  return (
    <div className="support-page">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={adminPanel.settings}
            className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary)"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Support Tickets')}</h1>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div className="card p-3 text-center">
            <div className="text-2xl font-bold tabular-nums">{stats.total ?? 0}</div>
            <div className="text-xs text-(--text-muted)">{__('Total')}</div>
          </div>
          {STATUSES.map((s) => (
            <div key={s} className="card p-3 text-center">
              <div className="text-2xl font-bold tabular-nums">{stats[s] ?? 0}</div>
              <div className="text-xs text-(--text-muted)">{__(STATUS_LABELS[s])}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-3">
        <select
          value={statusFilter ?? ''}
          onChange={(e) => { setStatusFilter(e.target.value || undefined); setPage(1); }}
          className="filter-select"
        >
          <option value="">{__('All Statuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{__(STATUS_LABELS[s])}</option>
          ))}
        </select>
        <select
          value={priorityFilter ?? ''}
          onChange={(e) => { setPriorityFilter(e.target.value || undefined); setPage(1); }}
          className="filter-select"
        >
          <option value="">{__('All Priorities')}</option>
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>{__(PRIORITY_LABELS[p])}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="mt-4 card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
          </div>
        ) : !data?.results.length ? (
          <p className="py-12 text-center text-sm text-(--text-muted)">
            {__('No tickets found.')}
          </p>
        ) : (
          <table className="w-full">
            <thead className="thead">
              <tr>
                <th className="th">{__('Subject')}</th>
                <th className="th w-28">{__('Status')}</th>
                <th className="th w-24">{__('Priority')}</th>
                <th className="th w-32">{__('Created')}</th>
                <th className="th w-32">{__('Updated')}</th>
              </tr>
            </thead>
            <tbody>
              {data.results.map((ticket) => (
                <tr key={ticket.id} className="tr">
                  <td className="td">
                    <Link
                      href={adminPanel.settingsSupportDetail(ticket.id)}
                      className="font-medium text-(--text-primary) hover:text-(--color-brand-500)"
                    >
                      {ticket.subject}
                    </Link>
                  </td>
                  <td className="td">
                    <span className={cn(
                      'badge',
                      ticket.status === 'open' && 'badge-published',
                      ticket.status === 'closed' && 'badge-draft',
                      ticket.status === 'resolved' && 'badge-published',
                      (ticket.status === 'awaiting_user' || ticket.status === 'awaiting_admin') && 'badge-scheduled',
                    )}>
                      {__(STATUS_LABELS[ticket.status] ?? ticket.status)}
                    </span>
                  </td>
                  <td className={cn('td text-sm', PRIORITY_COLORS[ticket.priority] ?? '')}>
                    {__(PRIORITY_LABELS[ticket.priority] ?? ticket.priority)}
                  </td>
                  <td className="td text-sm text-(--text-muted)">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </td>
                  <td className="td text-sm text-(--text-muted)">
                    {new Date(ticket.updatedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="pagination mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="btn btn-secondary btn-sm disabled:opacity-40"
          >
            {__('Previous')}
          </button>
          <span className="text-sm text-(--text-secondary)">
            {__('Page')} {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page >= data.totalPages}
            className="btn btn-secondary btn-sm disabled:opacity-40"
          >
            {__('Next')}
          </button>
        </div>
      )}
    </div>
  );
}
