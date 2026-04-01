'use client';

import type { ComponentType } from 'react';
import Link from 'next/link';
import {
  FileText, Layers, FolderOpen, Users, Image, Clock,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { PostType } from '@/engine/types/cms';
import { usePreferencesStore } from '@/store/preferences-store';
import { DEFAULT_WIDGET_ORDER, DEFAULT_HIDDEN_WIDGETS, DASHBOARD_WIDGETS } from '@/config/dashboard-widgets';
import GA4Widget from '@/components/admin/GA4Widget';
import StatCard from '@/components/admin/StatCard';
import RecentActivity from '@/components/admin/RecentActivity';
import ContentStatusWidget from '@/components/admin/ContentStatusWidget';
import QuickActionsWidget from '@/components/admin/QuickActionsWidget';
import { DashboardConfig } from '@/components/admin/DashboardConfig';

// ── Widget component lookup ─────────────────────────────────
const WIDGET_MAP: Record<string, ComponentType> = {
  'content-status': ContentStatusWidget,
  'quick-actions': QuickActionsWidget,
  'ga4': GA4Widget,
  'recent-activity': RecentActivityWidget,
};

function RecentActivityWidget() {
  const __ = useBlankTranslations();

  return (
    <div className="admin-card flex flex-col overflow-hidden">
      <div className="admin-widget-header">
        <h2 className="admin-h2 flex items-center gap-2">
          <Clock className="h-4 w-4 text-(--text-muted)" />
          {__('Recent Activity')}
        </h2>
        <Link
          href="/dashboard/cms/activity"
          className="text-xs font-medium text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          {__('View all')}
        </Link>
      </div>
      <RecentActivity />
    </div>
  );
}

// ── Span lookup ─────────────────────────────────────────────
const spanMap = Object.fromEntries(DASHBOARD_WIDGETS.map((w) => [w.id, w.span]));

export default function DashboardPage() {
  const __ = useBlankTranslations();
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const prefs = usePreferencesStore();
  const pageCounts = trpc.cms.counts.useQuery({ type: PostType.PAGE });
  const blogCounts = trpc.cms.counts.useQuery({ type: PostType.BLOG });
  const catCounts = trpc.categories.counts.useQuery();
  const userCounts = trpc.users.counts.useQuery();
  const mediaCounts = trpc.media.count.useQuery();

  // Use defaults until preferences have hydrated from DB to avoid SSR mismatch
  const widgetOrder = hydrated ? prefs.get('dashboard.widgetOrder', DEFAULT_WIDGET_ORDER) : DEFAULT_WIDGET_ORDER;
  const hiddenWidgets = hydrated ? prefs.get('dashboard.hiddenWidgets', DEFAULT_HIDDEN_WIDGETS) : DEFAULT_HIDDEN_WIDGETS;

  // Build visible ordered list
  const allIds = DASHBOARD_WIDGETS.map((w) => w.id);
  const orderedIds = [
    ...widgetOrder.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !widgetOrder.includes(id)),
  ].filter((id) => !hiddenWidgets.includes(id));

  return (
    <div className="mx-auto max-w-320">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-(--text-primary)">{__('Dashboard')}</h1>
          <p className="mt-2 text-(--text-secondary)">{__('Welcome to SweetCMS admin panel.')}</p>
        </div>
        <DashboardConfig />
      </div>

      {/* Stat cards — always visible, not reorderable */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label={__('Pages')}
          count={pageCounts.data?.all}
          href="/dashboard/cms/pages"
          icon={FileText}
          color="blue"
        />
        <StatCard
          label={__('Blog Posts')}
          count={blogCounts.data?.all}
          href="/dashboard/cms/blog"
          icon={Layers}
          color="green"
        />
        <StatCard
          label={__('Categories')}
          count={catCounts.data?.all}
          href="/dashboard/cms/categories"
          icon={FolderOpen}
          color="orange"
        />
        <StatCard
          label={__('Users')}
          count={userCounts.data?.all}
          href="/dashboard/users"
          icon={Users}
          color="purple"
        />
        <StatCard
          label={__('Media Files')}
          count={mediaCounts.data?.count}
          href="/dashboard/media"
          icon={Image}
          color="blue"
        />
      </div>

      {/* Configurable widgets */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {orderedIds.map((id) => {
          const Component = WIDGET_MAP[id];
          if (!Component) return null;
          const span = spanMap[id] ?? 'full';
          return (
            <div key={id} className={cn(span === 'full' && 'sm:col-span-2')}>
              <Component />
            </div>
          );
        })}
      </div>
    </div>
  );
}
