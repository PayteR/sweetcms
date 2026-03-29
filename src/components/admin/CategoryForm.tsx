'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { trpc } from '@/lib/trpc/client';
import { slugify } from '@/lib/slug';
import { useBlankTranslations } from '@/lib/translations';
import { ContentStatus } from '@/types/cms';
import { toast } from '@/store/toast-store';
import { useCmsAutosave } from '@/hooks/useCmsAutosave';
import AutosaveIndicator from './AutosaveIndicator';
import AutosaveRecoveryBanner from './AutosaveRecoveryBanner';
import CmsFormShell from './CmsFormShell';
import { RevisionHistory } from './RevisionHistory';
import { RichTextEditor } from './RichTextEditor';
import { TagInput } from './TagInput';

interface Props {
  categoryId?: string;
}

export function CategoryForm({ categoryId }: Props) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const isNew = !categoryId;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [status, setStatus] = useState<number>(ContentStatus.DRAFT);
  const [lang, setLang] = useState('en');
  const [icon, setIcon] = useState('');
  const [order, setOrder] = useState(0);
  const [metaDescription, setMetaDescription] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [noindex, setNoindex] = useState(false);
  const [publishedAt, setPublishedAt] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);

  const existingCat = trpc.categories.get.useQuery(
    { id: categoryId! },
    { enabled: !!categoryId }
  );

  useEffect(() => {
    if (existingCat.data) {
      const c = existingCat.data;
      setName(c.name);
      setSlug(c.slug);
      setSlugManual(true);
      setTitle(c.title);
      setText(c.text);
      setStatus(c.status);
      setLang(c.lang);
      setIcon(c.icon ?? '');
      setOrder(c.order);
      setMetaDescription(c.metaDescription ?? '');
      setSeoTitle(c.seoTitle ?? '');
      setNoindex(c.noindex);
      setPublishedAt(
        c.publishedAt ? new Date(c.publishedAt).toISOString().slice(0, 16) : ''
      );
      if (c.tagIds) setTagIds(c.tagIds);
    }
  }, [existingCat.data]);

  useEffect(() => {
    if (!slugManual && isNew) {
      setSlug(slugify(name));
    }
  }, [name, slugManual, isNew]);

  // Auto-fill title from name
  useEffect(() => {
    if (isNew && !title) {
      setTitle(name);
    }
  }, [name, isNew, title]);

  const createCat = trpc.categories.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(currentData);
      toast.success(__('Category created'));
      utils.categories.list.invalidate();
      utils.categories.counts.invalidate();
      router.push(`/dashboard/cms/categories/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updateCat = trpc.categories.update.useMutation({
    onSuccess: () => {
      clearAutosave(currentData);
      toast.success(__('Category updated'));
      utils.categories.list.invalidate();
      existingCat.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const currentData = useMemo(() => ({
    name, slug, title, text, status, metaDescription, seoTitle,
    icon, order, noindex, publishedAt, lang,
  }), [name, slug, title, text, status, metaDescription, seoTitle, icon, order, noindex, publishedAt, lang]);

  const initialData = useMemo(() => {
    const c = existingCat.data;
    if (!c) return currentData;
    return {
      name: c.name, slug: c.slug, title: c.title, text: c.text,
      status: c.status, metaDescription: c.metaDescription ?? '',
      seoTitle: c.seoTitle ?? '', icon: c.icon ?? '', order: c.order,
      noindex: c.noindex,
      publishedAt: c.publishedAt ? new Date(c.publishedAt).toISOString().slice(0, 16) : '',
      lang: c.lang,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingCat.data]);

  const isSaving = createCat.isPending || updateCat.isPending;

  const {
    isDirty,
    recoveredData,
    acceptRecovery,
    dismissRecovery,
    lastAutosaveAt,
    clearAutosave,
  } = useCmsAutosave({
    contentTypeId: 'category',
    contentId: categoryId ?? null,
    formData: currentData,
    initialData,
    dbUpdatedAt: existingCat.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!categoryId && existingCat.isLoading,
  });

  const handleRestore = useCallback(() => {
    if (!recoveredData) return;
    const d = recoveredData.formData;
    setName(d.name as string);
    setSlug(d.slug as string);
    setSlugManual(true);
    setTitle(d.title as string);
    setText(d.text as string);
    setStatus(d.status as number);
    setMetaDescription(d.metaDescription as string);
    setSeoTitle(d.seoTitle as string);
    setIcon(d.icon as string);
    setOrder(d.order as number);
    setNoindex(d.noindex as boolean);
    setPublishedAt(d.publishedAt as string);
    setLang(d.lang as string);
    acceptRecovery();
  }, [recoveredData, acceptRecovery]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isNew) {
      createCat.mutate({
        name,
        slug,
        lang,
        title: title || name,
        text,
        status,
        icon: icon || undefined,
        order,
        metaDescription: metaDescription || undefined,
        seoTitle: seoTitle || undefined,
        noindex,
        publishedAt: publishedAt
          ? new Date(publishedAt).toISOString()
          : undefined,
        tagIds,
      });
    } else {
      updateCat.mutate({
        id: categoryId!,
        name,
        slug,
        title: title || name,
        text,
        status,
        icon: icon || null,
        order,
        metaDescription: metaDescription || null,
        seoTitle: seoTitle || null,
        noindex,
        publishedAt: publishedAt
          ? new Date(publishedAt).toISOString()
          : null,
        tagIds,
      });
    }
  }

  if (!isNew && existingCat.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  const toolbar = (
    <>
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/cms/categories"
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Category') : __('Edit Category')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        <button
          type="submit"
          form="category-form"
          disabled={isSaving || !name}
          className="admin-btn admin-btn-primary disabled:opacity-50"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          {__('Save')}
        </button>
      </div>
    </>
  );

  return (
    <CmsFormShell toolbar={toolbar}>
      {recoveredData && (
        <AutosaveRecoveryBanner
          savedAt={recoveredData.savedAt}
          onRestore={handleRestore}
          onDismiss={dismissRecovery}
        />
      )}

      <form id="category-form" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="admin-card p-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={__('Category name')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Slug')}
                  </label>
                  <input
                    type="text"
                    required
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value);
                      setSlugManual(true);
                    }}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Title')}
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={__('Display title (can differ from name)')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Icon')}
                  </label>
                  <input
                    type="text"
                    value={icon}
                    onChange={(e) => setIcon(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={__('Icon name or URL')}
                  />
                </div>
              </div>
            </div>

            <div className="admin-card p-6">
              <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
                {__('Description')}
              </label>
              <RichTextEditor
                content={text}
                onChange={setText}
                placeholder={__('Category description...')}
              />
            </div>

            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('SEO')}</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('SEO Title')}
                  </label>
                  <input
                    type="text"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    maxLength={255}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Meta Description')}
                  </label>
                  <textarea
                    value={metaDescription}
                    onChange={(e) => setMetaDescription(e.target.value)}
                    maxLength={500}
                    rows={3}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={noindex}
                    onChange={(e) => setNoindex(e.target.checked)}
                    className="rounded border-(--border-primary)"
                  />
                  {__('No-index')}
                </label>
              </div>
            </div>

            {/* Revision History */}
            {!isNew && categoryId && (
              <RevisionHistory
                contentType="category"
                contentId={categoryId}
                currentData={currentData}
                onRestored={() => existingCat.refetch()}
              />
            )}
          </div>

          <div className="space-y-6">
            {/* Tags */}
            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Tags')}</h3>
              <div className="mt-4">
                <TagInput
                  selectedTagIds={tagIds}
                  onChange={setTagIds}
                  lang={lang}
                />
              </div>
            </div>

            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Status')}</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <select
                    value={status}
                    onChange={(e) => setStatus(Number(e.target.value))}
                    className="block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={ContentStatus.DRAFT}>{__('Draft')}</option>
                    <option value={ContentStatus.PUBLISHED}>
                      {__('Published')}
                    </option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Order')}
                  </label>
                  <input
                    type="number"
                    value={order}
                    onChange={(e) => setOrder(Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Language')}
                  </label>
                  <select
                    value={lang}
                    disabled={!isNew}
                    onChange={(e) => setLang(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm disabled:bg-(--surface-secondary)"
                  >
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Publish Date')}
                  </label>
                  <input
                    type="datetime-local"
                    value={publishedAt}
                    onChange={(e) => setPublishedAt(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </CmsFormShell>
  );
}
