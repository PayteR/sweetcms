'use client';

import {
  FileText, Layers, FolderOpen, Users, Image,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { PostType } from '@/engine/types/cms';
import StatCard from '@/engine/components/StatCard';
import { DashboardConfig } from '@/components/admin/DashboardConfig';
import { DashboardWidgetGrid } from '@/components/admin/DashboardWidgetGrid';

export default function DashboardPage() {
  const __ = useBlankTranslations();
  const pageCounts = trpc.cms.counts.useQuery({ type: PostType.PAGE });
  const blogCounts = trpc.cms.counts.useQuery({ type: PostType.BLOG });
  const catCounts = trpc.categories.counts.useQuery();
  const userCounts = trpc.users.counts.useQuery();
  const mediaCounts = trpc.media.count.useQuery();

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

      {/* Configurable widget grid with drag-and-drop */}
      <DashboardWidgetGrid />
    </div>
  );
}
