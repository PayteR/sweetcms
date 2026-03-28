'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  X,
} from 'lucide-react';

import type { ContentTypeDeclaration } from '@/config/cms';
import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { ContentStatus } from '@/types/cms';
import { cn } from '@/lib/utils';
import { toast } from '@/store/toast-store';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const STATUS_LABELS: Record<number, string> = {
  [ContentStatus.DRAFT]: 'Draft',
  [ContentStatus.PUBLISHED]: 'Published',
  [ContentStatus.SCHEDULED]: 'Scheduled',
};

const STATUS_COLORS: Record<number, string> = {
  [ContentStatus.DRAFT]: 'bg-gray-100 text-gray-700',
  [ContentStatus.PUBLISHED]: 'bg-green-100 text-green-700',
  [ContentStatus.SCHEDULED]: 'bg-blue-100 text-blue-700',
};

type StatusTab = 'all' | 'draft' | 'published' | 'scheduled' | 'trash';

interface Props {
  contentType: ContentTypeDeclaration;
}

export function CmsListView({ contentType }: Props) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();

  const [tab, setTab] = useState<StatusTab>('all');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    title: string;
    permanent?: boolean;
  } | null>(null);

  const isPostType = contentType.postType != null;
  const isCategoryType = contentType.id === 'category';
  const isTagType = contentType.id === 'tag';

  // Post queries
  const postList = trpc.cms.list.useQuery(
    {
      type: contentType.postType!,
      search: search || undefined,
      trashed: tab === 'trash',
      page,
      pageSize: 20,
    },
    { enabled: isPostType }
  );

  const postCounts = trpc.cms.counts.useQuery(
    { type: contentType.postType! },
    { enabled: isPostType }
  );

  // Category queries
  const catList = trpc.categories.list.useQuery(
    {
      search: search || undefined,
      trashed: tab === 'trash',
      page,
      pageSize: 20,
    },
    { enabled: isCategoryType }
  );

  const catCounts = trpc.categories.counts.useQuery(undefined, {
    enabled: isCategoryType,
  });

  // Tag queries
  const tagList = trpc.tags.list.useQuery(
    {
      search: search || undefined,
      trashed: tab === 'trash',
      page,
      pageSize: 20,
    },
    { enabled: isTagType }
  );

  const tagCounts = trpc.tags.counts.useQuery(undefined, {
    enabled: isTagType,
  });

  // Mutations
  const deletePost = trpc.cms.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Moved to trash'));
      utils.cms.list.invalidate();
      utils.cms.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const restorePost = trpc.cms.restore.useMutation({
    onSuccess: () => {
      toast.success(__('Restored'));
      utils.cms.list.invalidate();
      utils.cms.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const permanentDeletePost = trpc.cms.permanentDelete.useMutation({
    onSuccess: () => {
      toast.success(__('Permanently deleted'));
      utils.cms.list.invalidate();
      utils.cms.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const deleteCat = trpc.categories.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Moved to trash'));
      utils.categories.list.invalidate();
      utils.categories.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const restoreCat = trpc.categories.restore.useMutation({
    onSuccess: () => {
      toast.success(__('Restored'));
      utils.categories.list.invalidate();
      utils.categories.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const permanentDeleteCat = trpc.categories.permanentDelete.useMutation({
    onSuccess: () => {
      toast.success(__('Permanently deleted'));
      utils.categories.list.invalidate();
      utils.categories.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Tag mutations
  const deleteTag = trpc.tags.delete.useMutation({
    onSuccess: () => {
      toast.success(__('Moved to trash'));
      utils.tags.list.invalidate();
      utils.tags.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const restoreTag = trpc.tags.restore.useMutation({
    onSuccess: () => {
      toast.success(__('Restored'));
      utils.tags.list.invalidate();
      utils.tags.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  const permanentDeleteTag = trpc.tags.permanentDelete.useMutation({
    onSuccess: () => {
      toast.success(__('Permanently deleted'));
      utils.tags.list.invalidate();
      utils.tags.counts.invalidate();
    },
    onError: (err) => toast.error(err.message),
  });

  // Unified data
  const data = isPostType ? postList.data : isTagType ? tagList.data : catList.data;
  const counts = isPostType ? postCounts.data : isTagType ? tagCounts.data : catCounts.data;
  const isLoading = isPostType ? postList.isLoading : isTagType ? tagList.isLoading : catList.isLoading;

  const items: Array<{
    id: string;
    title: string;
    slug: string;
    status: number;
    lang: string;
    updatedAt: Date | null;
    publishedAt: Date | null;
  }> = (data?.results ?? []).map((item: Record<string, unknown>) => ({
    id: item.id as string,
    title: (item.title ?? item.name ?? '') as string,
    slug: item.slug as string,
    status: item.status as number,
    lang: item.lang as string,
    updatedAt: (item.updatedAt ?? null) as Date | null,
    publishedAt: (item.publishedAt ?? null) as Date | null,
  }));

  const allTabs: { key: StatusTab; label: string; count?: number }[] = [
    { key: 'all', label: 'All', count: counts?.all },
    { key: 'draft', label: 'Draft', count: counts?.draft },
    { key: 'published', label: 'Published', count: counts?.published },
    { key: 'scheduled', label: 'Scheduled', count: counts?.scheduled },
    { key: 'trash', label: 'Trash', count: counts?.trash },
  ];

  // Tags don't support scheduling
  const tabs = isTagType
    ? allTabs.filter((t) => t.key !== 'scheduled')
    : allTabs;

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function handleDelete(id: string, title: string) {
    if (tab === 'trash') {
      setDeleteTarget({ id, title, permanent: true });
    } else {
      setDeleteTarget({ id, title });
    }
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    if (deleteTarget.permanent) {
      if (isPostType) permanentDeletePost.mutate({ id: deleteTarget.id });
      else if (isTagType) permanentDeleteTag.mutate({ id: deleteTarget.id });
      else permanentDeleteCat.mutate({ id: deleteTarget.id });
    } else {
      if (isPostType) deletePost.mutate({ id: deleteTarget.id });
      else if (isTagType) deleteTag.mutate({ id: deleteTarget.id });
      else deleteCat.mutate({ id: deleteTarget.id });
    }
    setDeleteTarget(null);
  }

  function handleRestore(id: string) {
    if (isPostType) restorePost.mutate({ id });
    else if (isTagType) restoreTag.mutate({ id });
    else restoreCat.mutate({ id });
  }

  function formatDate(date: Date | string | null) {
    if (!date) return '—';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {__(contentType.labelPlural)}
        </h1>
        <Link
          href={`/dashboard/cms/${contentType.adminSlug}/new`}
          className="admin-btn admin-btn-primary"
        >
          <Plus className="h-4 w-4" />
          {__(`New ${contentType.label}`)}
        </Link>
      </div>

      {/* Status tabs */}
      <div className="mt-4 flex gap-1 border-b border-gray-200">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setPage(1);
            }}
            className={cn(
              'border-b-2 px-3 pb-2 text-sm font-medium transition-colors',
              tab === t.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            {__(t.label)}
            {t.count != null && (
              <span className="ml-1.5 text-xs text-gray-400">({t.count})</span>
            )}
          </button>
        ))}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="mt-4 flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder={__(`Search ${contentType.labelPlural.toLowerCase()}...`)}
            className="w-full rounded-md border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSearchInput('');
                setPage(1);
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button type="submit" className="admin-btn admin-btn-secondary">
          {__('Search')}
        </button>
      </form>

      {/* Table */}
      <div className="admin-card mt-4 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        ) : (
          <table className="w-full">
            <thead className="admin-thead">
              <tr>
                <th className="admin-th">{__('Title')}</th>
                <th className="admin-th w-24">{__('Status')}</th>
                <th className="admin-th w-20">{__('Lang')}</th>
                <th className="admin-th w-32">{__('Date')}</th>
                <th className="admin-th w-28" />
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td
                    className="admin-td py-12 text-center text-gray-400"
                    colSpan={5}
                  >
                    {search
                      ? __('No results found.')
                      : __('No items yet. Create your first one.')}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="admin-td">
                      <Link
                        href={`/dashboard/cms/${contentType.adminSlug}/${item.id}`}
                        className="font-medium text-gray-900 hover:text-blue-600"
                      >
                        {item.title || __('(untitled)')}
                      </Link>
                      <p className="mt-0.5 text-xs text-gray-400">
                        /{contentType.urlPrefix === '/' ? '' : contentType.urlPrefix}
                        {item.slug}
                      </p>
                    </td>
                    <td className="admin-td">
                      <span
                        className={cn(
                          'inline-block rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_COLORS[item.status] ?? 'bg-gray-100 text-gray-600'
                        )}
                      >
                        {STATUS_LABELS[item.status] ?? 'Unknown'}
                      </span>
                    </td>
                    <td className="admin-td text-xs uppercase">{item.lang}</td>
                    <td className="admin-td text-xs text-gray-500">
                      {formatDate(item.publishedAt ?? item.updatedAt)}
                    </td>
                    <td className="admin-td">
                      <div className="flex items-center justify-end gap-1">
                        {tab === 'trash' ? (
                          <>
                            <button
                              onClick={() => handleRestore(item.id)}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-green-600"
                              title={__('Restore')}
                            >
                              <RotateCcw className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(item.id, item.title)}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                              title={__('Delete permanently')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        ) : (
                          <>
                            <Link
                              href={`/dashboard/cms/${contentType.adminSlug}/${item.id}`}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-blue-600"
                              title={__('Edit')}
                            >
                              <Pencil className="h-4 w-4" />
                            </Link>
                            <button
                              onClick={() => handleDelete(item.id, item.title)}
                              className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-red-600"
                              title={__('Trash')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            {__('Page')} {data.page} {__('of')} {data.totalPages} ({data.total}{' '}
            {__('total')})
          </p>
          <div className="flex gap-1">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="admin-btn admin-btn-secondary disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              className="admin-btn admin-btn-secondary disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={
          deleteTarget?.permanent
            ? __('Delete permanently?')
            : __('Move to trash?')
        }
        message={
          deleteTarget?.permanent
            ? __(`"${deleteTarget?.title}" will be permanently deleted. This cannot be undone.`)
            : __(`"${deleteTarget?.title}" will be moved to trash.`)
        }
        confirmLabel={deleteTarget?.permanent ? __('Delete') : __('Trash')}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
