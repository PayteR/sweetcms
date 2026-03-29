'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Eye, Loader2, ImageIcon, X } from 'lucide-react';
import Link from 'next/link';

import type { ContentTypeDeclaration } from '@/config/cms';
import { trpc } from '@/lib/trpc/client';
import { slugify } from '@/lib/slug';
import { useBlankTranslations } from '@/lib/translations';
import { ContentStatus } from '@/types/cms';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';
import { RevisionHistory } from './RevisionHistory';
import { RichTextEditor } from './RichTextEditor';
import { MediaPickerDialog } from './MediaPickerDialog';
import { TagInput } from './TagInput';

interface Props {
  contentType: ContentTypeDeclaration;
  postId?: string;
}

export function PostForm({ contentType, postId }: Props) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const isNew = !postId;

  // Form state
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<number>(ContentStatus.DRAFT);
  const [lang, setLang] = useState('en');
  const [metaDescription, setMetaDescription] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [featuredImage, setFeaturedImage] = useState('');
  const [featuredImageAlt, setFeaturedImageAlt] = useState('');
  const [jsonLd, setJsonLd] = useState('');
  const [noindex, setNoindex] = useState(false);
  const [publishedAt, setPublishedAt] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  // Fetch existing post
  const existingPost = trpc.cms.get.useQuery(
    { id: postId! },
    { enabled: !!postId }
  );

  // Fetch published categories for the selector
  const categoriesList = trpc.categories.listPublished.useQuery({
    lang: 'en',
    page: 1,
    pageSize: 100,
  });

  // Populate form with existing data
  useEffect(() => {
    if (existingPost.data) {
      const p = existingPost.data;
      setTitle(p.title);
      setSlug(p.slug);
      setSlugManual(true);
      setContent(p.content);
      setStatus(p.status);
      setLang(p.lang);
      setMetaDescription(p.metaDescription ?? '');
      setSeoTitle(p.seoTitle ?? '');
      setFeaturedImage(p.featuredImage ?? '');
      setFeaturedImageAlt(p.featuredImageAlt ?? '');
      setJsonLd(p.jsonLd ?? '');
      setNoindex(p.noindex);
      setPublishedAt(
        p.publishedAt ? new Date(p.publishedAt).toISOString().slice(0, 16) : ''
      );
      setCategoryIds(p.categoryIds ?? []);
      setTagIds(p.tagIds ?? []);
    }
  }, [existingPost.data]);

  // Auto-generate slug from title
  useEffect(() => {
    if (!slugManual && isNew) {
      setSlug(slugify(title));
    }
  }, [title, slugManual, isNew]);

  const createPost = trpc.cms.create.useMutation({
    onSuccess: (data) => {
      toast.success(__(`${contentType.label} created`));
      utils.cms.list.invalidate();
      utils.cms.counts.invalidate();
      router.push(`/dashboard/cms/${contentType.adminSlug}/${data.id}`);
    },
    onError: (err) => toast.error(err.message),
  });

  const updatePost = trpc.cms.update.useMutation({
    onSuccess: () => {
      toast.success(__(`${contentType.label} updated`));
      utils.cms.list.invalidate();
      existingPost.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const currentData = useMemo(() => ({
    title, slug, content, status, metaDescription, seoTitle,
    featuredImage, featuredImageAlt, jsonLd, noindex, publishedAt, lang,
  }), [title, slug, content, status, metaDescription, seoTitle, featuredImage, featuredImageAlt, jsonLd, noindex, publishedAt, lang]);

  const isSaving = createPost.isPending || updatePost.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isNew) {
      createPost.mutate({
        type: contentType.postType!,
        title,
        slug,
        lang,
        content,
        status,
        metaDescription: metaDescription || undefined,
        seoTitle: seoTitle || undefined,
        featuredImage: featuredImage || undefined,
        featuredImageAlt: featuredImageAlt || undefined,
        jsonLd: jsonLd || undefined,
        noindex,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : undefined,
        categoryIds: categoryIds.length > 0 ? categoryIds : undefined,
        tagIds: tagIds.length > 0 ? tagIds : undefined,
      });
    } else {
      updatePost.mutate({
        id: postId!,
        title,
        slug,
        content,
        status,
        metaDescription: metaDescription || null,
        seoTitle: seoTitle || null,
        featuredImage: featuredImage || null,
        featuredImageAlt: featuredImageAlt || null,
        jsonLd: jsonLd || null,
        noindex,
        publishedAt: publishedAt ? new Date(publishedAt).toISOString() : null,
        categoryIds,
        tagIds,
      });
    }
  }

  function handlePublish() {
    setStatus(ContentStatus.PUBLISHED);
    if (!publishedAt) {
      setPublishedAt(new Date().toISOString().slice(0, 16));
    }
    setTimeout(() => {
      const form = document.getElementById('post-form') as HTMLFormElement;
      form?.requestSubmit();
    }, 0);
  }

  function toggleCategory(catId: string) {
    setCategoryIds((prev) =>
      prev.includes(catId)
        ? prev.filter((id) => id !== catId)
        : [...prev, catId]
    );
  }

  if (!isNew && existingPost.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/cms/${contentType.adminSlug}`}
            className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-(--text-primary)">
            {isNew
              ? __(`New ${contentType.label}`)
              : __(`Edit ${contentType.label}`)}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {existingPost.data?.previewToken && (
            <a
              href={`${contentType.urlPrefix}${slug}?preview=${existingPost.data.previewToken}`}
              target="_blank"
              rel="noopener noreferrer"
              className="admin-btn admin-btn-secondary"
            >
              <Eye className="h-4 w-4" />
              {__('Preview')}
            </a>
          )}
          {status !== ContentStatus.PUBLISHED && (
            <button
              type="button"
              onClick={handlePublish}
              disabled={isSaving || !title}
              className="admin-btn admin-btn-primary disabled:opacity-50"
            >
              {__('Publish')}
            </button>
          )}
          <button
            type="submit"
            form="post-form"
            disabled={isSaving || !title}
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
      </div>

      <form id="post-form" onSubmit={handleSubmit} className="mt-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main content — 2/3 */}
          <div className="space-y-6 lg:col-span-2">
            {/* Title */}
            <div className="admin-card p-6">
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Title')}
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={__(`${contentType.label} title`)}
              />

              <label className="mt-3 block text-sm font-medium text-(--text-secondary)">
                {__('Slug')}
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => {
                  setSlug(e.target.value);
                  setSlugManual(true);
                }}
                className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="url-slug"
              />
            </div>

            {/* Content — Rich Text Editor */}
            <div className="admin-card p-6">
              <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
                {__('Content')}
              </label>
              <RichTextEditor
                content={content}
                onChange={setContent}
                placeholder={__('Start writing your content...')}
              />
            </div>

            {/* SEO */}
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
                    maxLength={100}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={__('Custom title for search engines')}
                  />
                  <p className="mt-1 text-xs text-(--text-muted)">
                    {seoTitle.length}/100
                  </p>
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
                    placeholder={__('Description for search engines')}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={noindex}
                    onChange={(e) => setNoindex(e.target.checked)}
                    className="rounded border-(--border-primary)"
                  />
                  {__('No-index (hide from search engines)')}
                </label>
              </div>
            </div>

            {/* Revision History */}
            {!isNew && postId && (
              <RevisionHistory
                contentType="post"
                contentId={postId}
                currentData={currentData}
                onRestored={() => existingPost.refetch()}
              />
            )}

            {/* JSON-LD */}
            {contentType.postFormFields?.jsonLd && (
              <div className="admin-card p-6">
                <h3 className="admin-h2">{__('Structured Data (JSON-LD)')}</h3>
                <textarea
                  value={jsonLd}
                  onChange={(e) => setJsonLd(e.target.value)}
                  rows={6}
                  className="mt-3 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder='{"@context": "https://schema.org", ...}'
                />
              </div>
            )}
          </div>

          {/* Sidebar — 1/3 */}
          <div className="space-y-6">
            {/* Status & Scheduling */}
            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Status')}</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Status')}
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(Number(e.target.value))}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={ContentStatus.DRAFT}>{__('Draft')}</option>
                    <option value={ContentStatus.PUBLISHED}>
                      {__('Published')}
                    </option>
                    <option value={ContentStatus.SCHEDULED}>
                      {__('Scheduled')}
                    </option>
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

                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Language')}
                  </label>
                  <select
                    value={lang}
                    onChange={(e) => setLang(e.target.value)}
                    disabled={!isNew}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-(--surface-secondary)"
                  >
                    <option value="en">English</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Categories */}
            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Categories')}</h3>
              <div className="mt-3 max-h-48 space-y-1.5 overflow-y-auto">
                {categoriesList.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-(--text-muted)" />
                ) : (categoriesList.data?.results ?? []).length === 0 ? (
                  <p className="text-xs text-(--text-muted)">
                    {__('No categories yet.')}
                  </p>
                ) : (
                  (categoriesList.data?.results ?? []).map((cat) => (
                    <label
                      key={cat.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input
                        type="checkbox"
                        checked={categoryIds.includes(cat.id)}
                        onChange={() => toggleCategory(cat.id)}
                        className="rounded border-(--border-primary)"
                      />
                      {cat.name}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Tags')}</h3>
              <div className="mt-3">
                <TagInput
                  selectedTagIds={tagIds}
                  onChange={setTagIds}
                  lang={lang}
                />
              </div>
            </div>

            {/* Featured Image */}
            {contentType.postFormFields?.featuredImage && (
              <div className="admin-card p-6">
                <h3 className="admin-h2">{__('Featured Image')}</h3>
                <div className="mt-4 space-y-3">
                  {featuredImage ? (
                    <div className="relative">
                      <img
                        src={featuredImage}
                        alt={featuredImageAlt || 'Preview'}
                        className="h-32 w-full rounded-md border border-(--border-primary) object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setFeaturedImage('');
                          setFeaturedImageAlt('');
                        }}
                        className="absolute right-1 top-1 rounded bg-(--surface-primary)/90 p-1 shadow-sm hover:bg-(--surface-primary)"
                      >
                        <X className="h-3.5 w-3.5 text-(--text-secondary)" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowMediaPicker(true)}
                      className="flex w-full items-center justify-center gap-2 rounded-md border-2 border-dashed border-(--border-primary) px-4 py-6 text-sm text-(--text-muted) hover:border-(--border-primary) hover:text-(--text-secondary)"
                    >
                      <ImageIcon className="h-5 w-5" />
                      {__('Select Image')}
                    </button>
                  )}
                  {featuredImage && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMediaPicker(true)}
                        className="text-xs text-blue-600 hover:text-blue-700"
                      >
                        {__('Change')}
                      </button>
                    </div>
                  )}
                  {featuredImage && (
                    <div>
                      <label className="block text-sm font-medium text-(--text-secondary)">
                        {__('Alt Text')}
                      </label>
                      <input
                        type="text"
                        value={featuredImageAlt}
                        onChange={(e) => setFeaturedImageAlt(e.target.value)}
                        className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder={__('Describe the image')}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </form>

      {/* Media Picker Dialog */}
      <MediaPickerDialog
        open={showMediaPicker}
        onClose={() => setShowMediaPicker(false)}
        onSelect={(url, alt) => {
          setFeaturedImage(url);
          if (alt) setFeaturedImageAlt(alt);
        }}
      />
    </div>
  );
}
