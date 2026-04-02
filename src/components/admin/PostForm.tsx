'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Eye, Loader2, ImageIcon, X } from 'lucide-react';

import type { ContentTypeDeclaration } from '@/config/cms';
import { useSession } from '@/lib/auth-client';
import { trpc } from '@/lib/trpc/client';
import { slugify } from '@/engine/lib/slug';
import { useBlankTranslations } from '@/lib/translations';
import { ContentStatus, PostType } from '@/engine/types/cms';
import { toast } from '@/store/toast-store';
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS } from '@/lib/constants';
import { convertUTCToLocal, convertLocalToUTC } from '@/engine/lib/datetime';
import { useCmsFormState } from '@/engine/hooks/useCmsFormState';
import { useLinkPicker } from '@/engine/hooks/useLinkPicker';
import { useLinkValidation } from '@/engine/hooks/useLinkValidation';
import { useCmsAutosave } from '@/engine/hooks/useCmsAutosave';
import { useKeyboardShortcuts } from '@/engine/hooks/useKeyboardShortcuts';
import AutosaveIndicator from '@/engine/components/AutosaveIndicator';
import AutosaveRecoveryBanner from '@/engine/components/AutosaveRecoveryBanner';
import BrokenLinksBanner from '@/engine/components/BrokenLinksBanner';
import CmsFormShell from '@/engine/components/CmsFormShell';
import { CustomFieldsEditor, type CustomFieldsEditorHandle } from '@/engine/components/CustomFieldsEditor';
import { FallbackRadio } from './FallbackRadio';
import InternalLinkDialog from './InternalLinkDialog';
import { MediaPickerDialog } from '@/engine/components/MediaPickerDialog';
import { PostAttachments } from './PostAttachments';
import { RevisionHistory } from '@/engine/components/RevisionHistory';
import { RichTextEditor } from '@/engine/components/RichTextEditor';
import { shortcodeConfig } from '@/lib/shortcodes/config';
import { SEOFields } from '@/engine/components/SEOFields';
import { SeoPreviewCard } from '@/engine/components/SeoPreviewCard';
import { TagInput } from '@/engine/components/TagInput';
import { TranslationBar } from './TranslationBar';

interface PostFormData extends Record<string, unknown> {
  title: string;
  slug: string;
  content: string;
  status: number;
  lang: string;
  metaDescription: string;
  seoTitle: string;
  featuredImage: string;
  featuredImageAlt: string;
  jsonLd: string;
  noindex: boolean;
  publishedAt: string;
  categoryIds: string[];
  tagIds: string[];
  parentId: string | null;
  fallbackToDefault: boolean | null;
}

interface Props {
  contentType: ContentTypeDeclaration;
  postId?: string;
}

export function PostForm({ contentType, postId }: Props) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !postId;

  // UI-only state (not part of form data)
  const [slugManual, setSlugManual] = useState(false);
  const [showMediaPicker, setShowMediaPicker] = useState(false);

  // Fetch existing post (wait for session to avoid UNAUTHORIZED on first render)
  const existingPost = trpc.cms.get.useQuery(
    { id: postId! },
    { enabled: !!postId && !!session }
  );

  // Fetch translation siblings (edit mode only)
  const translationSiblings = trpc.cms.getTranslationSiblings.useQuery(
    { id: postId! },
    { enabled: !!postId && !!session }
  );

  // Derive lang for related queries (post lang if editing, default locale for new)
  const postLang = existingPost.data?.lang ?? DEFAULT_LOCALE;

  // Fetch published categories for the selector
  const categoriesList = trpc.categories.listPublished.useQuery(
    { lang: postLang, page: 1, pageSize: 100 },
    { enabled: !!session },
  );

  // Page tree for parent page selector (pages only)
  const isPageType = contentType.postType === PostType.PAGE;
  const pageTree = trpc.cms.getPageTree.useQuery(
    { lang: postLang },
    { enabled: isPageType && !!session }
  );

  const post = existingPost.data;

  // Compute initial form data from post
  const initialFormData: PostFormData = useMemo(() => {
    if (!post) {
      return {
        title: '', slug: '', content: '', status: ContentStatus.DRAFT,
        lang: DEFAULT_LOCALE, metaDescription: '', seoTitle: '',
        featuredImage: '', featuredImageAlt: '', jsonLd: '', noindex: false,
        publishedAt: '', categoryIds: [], tagIds: [], parentId: null,
        fallbackToDefault: null,
      };
    }
    return {
      title: post.title,
      slug: post.slug,
      content: post.content ?? '',
      status: post.status,
      lang: post.lang ?? DEFAULT_LOCALE,
      metaDescription: post.metaDescription ?? '',
      seoTitle: post.seoTitle ?? '',
      featuredImage: post.featuredImage ?? '',
      featuredImageAlt: post.featuredImageAlt ?? '',
      jsonLd: post.jsonLd ?? '',
      noindex: post.noindex ?? false,
      publishedAt: post.publishedAt ? convertUTCToLocal(post.publishedAt) : '',
      categoryIds: post.categoryIds ?? [],
      tagIds: post.tagIds ?? [],
      parentId: post.parentId ?? null,
      fallbackToDefault: post.fallbackToDefault ?? null,
    };
  }, [post]);

  const {
    formData, setFormData,
    fieldErrors, handleChange, handleSaveError,
  } = useCmsFormState<PostFormData>(initialFormData, 'info');

  // Sync form data when post loads
  useEffect(() => {
    if (post) {
      setFormData(initialFormData);
      setSlugManual(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post]);

  // Auto-generate slug from title (new posts only)
  useEffect(() => {
    if (!slugManual && isNew) {
      handleChange('slug', slugify(formData.title));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.title, slugManual, isNew]);

  // New hooks
  const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();
  const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();
  const duplicateAsTranslation = trpc.cms.duplicateAsTranslation.useMutation();
  const translationAvailableQuery = trpc.options.translationAvailable.useQuery();
  const customFieldsRef = useRef<CustomFieldsEditorHandle>(null);

  const createPost = trpc.cms.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(formData);
      customFieldsRef.current?.save(data.id).catch((err: unknown) => {
        console.error('[PostForm] Failed to save custom fields', err);
      });
      toast.success(__(`${contentType.label} created`));
      utils.cms.list.invalidate();
      utils.cms.counts.invalidate();
      router.push(`/dashboard/cms/${contentType.adminSlug}/${data.id}`);
    },
    onError: (err) => handleSaveError(err, `Failed to create ${contentType.label}`),
  });

  const updatePost = trpc.cms.update.useMutation({
    onSuccess: () => {
      clearAutosave(formData);
      if (postId) customFieldsRef.current?.save(postId).catch((err: unknown) => {
        console.error('[PostForm] Failed to save custom fields', err);
      });
      toast.success(__(`${contentType.label} updated`));
      utils.cms.list.invalidate();
      existingPost.refetch();
      // Post-save link validation
      validateLinks(formData.content);
    },
    onError: (err) => handleSaveError(err, `Failed to update ${contentType.label}`),
  });

  const isSaving = createPost.isPending || updatePost.isPending;

  const {
    isDirty,
    recoveredData,
    acceptRecovery,
    dismissRecovery,
    lastAutosaveAt,
    clearAutosave,
  } = useCmsAutosave({
    contentTypeId: contentType.id,
    contentId: postId ?? null,
    formData,
    initialData: initialFormData,
    dbUpdatedAt: existingPost.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!postId && existingPost.isLoading,
  });

  // Use ref so keyboard shortcut always calls the latest handlePublish
  const handlePublishRef = useRef(handlePublish);
  useEffect(() => {
    handlePublishRef.current = handlePublish;
  });

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 's',
          ctrl: true,
          handler: () => {
            const form = document.getElementById('post-form') as HTMLFormElement;
            form?.requestSubmit();
          },
        },
        {
          key: 'p',
          ctrl: true,
          shift: true,
          handler: () => handlePublishRef.current(),
        },
      ],
      []
    )
  );

  const handleRestore = useCallback(() => {
    if (!recoveredData) return;
    const d = recoveredData.formData;
    setFormData({
      title: d.title as string,
      slug: d.slug as string,
      content: d.content as string,
      status: d.status as number,
      lang: d.lang as string,
      metaDescription: d.metaDescription as string,
      seoTitle: d.seoTitle as string,
      featuredImage: d.featuredImage as string,
      featuredImageAlt: d.featuredImageAlt as string,
      jsonLd: d.jsonLd as string,
      noindex: d.noindex as boolean,
      publishedAt: d.publishedAt as string,
      categoryIds: d.categoryIds as string[],
      tagIds: d.tagIds as string[],
      parentId: d.parentId as string | null,
      fallbackToDefault: d.fallbackToDefault as boolean | null,
    });
    setSlugManual(true);
    acceptRecovery();
  }, [recoveredData, acceptRecovery, setFormData]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isNew) {
      createPost.mutate({
        type: contentType.postType!,
        title: formData.title,
        slug: formData.slug,
        lang: formData.lang,
        content: formData.content,
        status: formData.status,
        metaDescription: formData.metaDescription || undefined,
        seoTitle: formData.seoTitle || undefined,
        featuredImage: formData.featuredImage || undefined,
        featuredImageAlt: formData.featuredImageAlt || undefined,
        jsonLd: formData.jsonLd || undefined,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : undefined,
        parentId: formData.parentId ?? undefined,
        categoryIds: formData.categoryIds.length > 0 ? formData.categoryIds : undefined,
        tagIds: formData.tagIds.length > 0 ? formData.tagIds : undefined,
        fallbackToDefault: formData.fallbackToDefault ?? undefined,
      });
    } else {
      updatePost.mutate({
        id: postId!,
        title: formData.title,
        slug: formData.slug,
        content: formData.content,
        status: formData.status,
        metaDescription: formData.metaDescription || null,
        seoTitle: formData.seoTitle || null,
        featuredImage: formData.featuredImage || null,
        featuredImageAlt: formData.featuredImageAlt || null,
        jsonLd: formData.jsonLd || null,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : null,
        parentId: formData.parentId,
        categoryIds: formData.categoryIds,
        tagIds: formData.tagIds,
        fallbackToDefault: formData.fallbackToDefault,
      });
    }
  }

  function handlePublish() {
    handleChange('status', ContentStatus.PUBLISHED);
    if (!formData.publishedAt) {
      handleChange('publishedAt', new Date().toISOString().slice(0, 16));
    }
    setTimeout(() => {
      const form = document.getElementById('post-form') as HTMLFormElement;
      form?.requestSubmit();
    }, 0);
  }

  function toggleCategory(catId: string) {
    handleChange(
      'categoryIds',
      formData.categoryIds.includes(catId)
        ? formData.categoryIds.filter((id) => id !== catId)
        : [...formData.categoryIds, catId]
    );
  }

  if (!isNew && existingPost.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  const toolbar = (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(`/dashboard/cms/${contentType.adminSlug}`);
          }}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew
            ? __(`New ${contentType.label}`)
            : __(`Edit ${contentType.label}`)}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        {existingPost.data?.previewToken && (
          <a
            href={`${contentType.urlPrefix}${formData.slug}?preview=${existingPost.data.previewToken}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-secondary"
          >
            <Eye className="h-4 w-4" />
            {__('Preview')}
          </a>
        )}
        {formData.status !== ContentStatus.PUBLISHED && (
          <button
            type="button"
            onClick={handlePublish}
            disabled={isSaving || !formData.title}
            className="btn btn-primary disabled:opacity-50"
          >
            {__('Publish')}
          </button>
        )}
        <button
          type="submit"
          form="post-form"
          disabled={isSaving || !formData.title}
          className="btn btn-primary disabled:opacity-50"
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

      <BrokenLinksBanner urls={brokenLinks} onDismiss={dismissBrokenLinks} />

      <form id="post-form" onSubmit={handleSubmit}>
        <div className="post-form-layout grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Main content — 2/3 */}
          <div className="post-form-main space-y-6 lg:col-span-2">
            {/* Title */}
            <div className="card p-6">
              <label className="block text-sm font-medium text-(--text-secondary)">
                {__('Title')}
              </label>
              <input
                type="text"
                required
                value={formData.title}
                onChange={(e) => handleChange('title', e.target.value)}
                className="input mt-1"
                placeholder={__(`${contentType.label} title`)}
              />

              <label className="mt-3 block text-sm font-medium text-(--text-secondary)">
                {__('Slug')}
              </label>
              <input
                type="text"
                value={formData.slug}
                onChange={(e) => {
                  handleChange('slug', e.target.value);
                  setSlugManual(true);
                }}
                className="input mt-1 font-mono"
                placeholder="url-slug"
              />
            </div>

            {/* Content — Rich Text Editor */}
            <div className="card p-6">
              <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
                {__('Content')}
              </label>
              <RichTextEditor
                content={formData.content}
                onChange={(v) => handleChange('content', v)}
                placeholder={__('Start writing your content...')}
                postId={post?.id}
                storageKey={`post-${post?.id ?? 'new'}`}
                onRequestLinkPicker={openLinkPicker}
                editorRef={editorRef}
                shortcodes={shortcodeConfig}
              />
            </div>

            {/* SEO */}
            <div className="card p-6">
              <h3 className="h2">{__('SEO')}</h3>
              <div className="mt-4 space-y-4">
                <SEOFields
                  seoTitle={formData.seoTitle}
                  metaDescription={formData.metaDescription}
                  noindex={formData.noindex}
                  onSeoTitleChange={(v) => handleChange('seoTitle', v)}
                  onMetaDescriptionChange={(v) => handleChange('metaDescription', v)}
                  onNoindexChange={(v) => handleChange('noindex', v)}
                  fieldErrors={fieldErrors}
                />
              </div>
            </div>

            {/* SEO Preview */}
            <SeoPreviewCard
              title={formData.seoTitle || formData.title}
              description={formData.metaDescription}
              slug={formData.slug}
              urlPrefix={contentType.urlPrefix}
              featuredImage={formData.featuredImage || undefined}
            />

            {/* Custom Fields */}
            <CustomFieldsEditor
              ref={customFieldsRef}
              contentType={contentType.id}
              contentId={postId}
              isAuthenticated={!!session}
            />

            {/* Revision History */}
            {!isNew && postId && (
              <RevisionHistory
                contentType="post"
                contentId={postId}
                currentData={formData}
                onRestored={() => existingPost.refetch()}
              />
            )}

            {/* Attachments */}
            <PostAttachments postId={postId} />

            {/* JSON-LD */}
            {contentType.postFormFields?.jsonLd && (
              <div className="card p-6">
                <h3 className="h2">{__('Structured Data (JSON-LD)')}</h3>
                <textarea
                  value={formData.jsonLd}
                  onChange={(e) => handleChange('jsonLd', e.target.value)}
                  rows={6}
                  className="textarea mt-3 font-mono"
                  placeholder='{"@context": "https://schema.org", ...}'
                />
              </div>
            )}
          </div>

          {/* Sidebar — 1/3 */}
          <div className="post-form-sidebar space-y-6">
            {/* Status & Scheduling */}
            <div className="card p-6">
              <h3 className="h2">{__('Status')}</h3>
              <div className="mt-4 space-y-4">
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Status')}
                  </label>
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange('status', Number(e.target.value))}
                    className="select mt-1 w-full"
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

                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Publish Date')}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.publishedAt}
                    onChange={(e) => handleChange('publishedAt', e.target.value)}
                    className="input mt-1"
                  />
                </div>

                <div className="field-group">
                  {post && translationSiblings.data ? (
                    <TranslationBar
                      currentLang={formData.lang}
                      translations={translationSiblings.data}
                      adminSlug={contentType.adminSlug}
                      translationAvailable={translationAvailableQuery.data?.available ?? false}
                      onDuplicate={async (targetLang, autoTranslate) => {
                        const result = await duplicateAsTranslation.mutateAsync({
                          id: post.id,
                          targetLang,
                          autoTranslate,
                        });
                        router.push(`/dashboard/cms/${contentType.adminSlug}/${result.id}`);
                      }}
                    />
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-(--text-secondary)">
                        {__('Language')}
                      </label>
                      <select
                        value={formData.lang}
                        onChange={(e) => handleChange('lang', e.target.value)}
                        disabled={!isNew}
                        className="select mt-1 w-full disabled:bg-(--surface-secondary)"
                      >
                        {LOCALES.map((l) => (
                          <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {post && (
                  <FallbackRadio
                    value={formData.fallbackToDefault}
                    onChange={(v) => handleChange('fallbackToDefault', v)}
                    ct={contentType}
                  />
                )}
              </div>
            </div>

            {/* Parent Page (pages only) */}
            {isPageType && (
              <div className="card p-6">
                <h3 className="h2">{__('Parent Page')}</h3>
                <select
                  value={formData.parentId ?? ''}
                  onChange={(e) => handleChange('parentId', e.target.value || null)}
                  className="select mt-3 w-full"
                >
                  <option value="">{__('None (top level)')}</option>
                  {(pageTree.data ?? [])
                    .filter((p) => p.id !== postId)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {'— '.repeat(p.depth)}{p.title}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Categories */}
            <div className="card p-6">
              <h3 className="h2">{__('Categories')}</h3>
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
                        checked={formData.categoryIds.includes(cat.id)}
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
            <div className="card p-6">
              <h3 className="h2">{__('Tags')}</h3>
              <div className="mt-3">
                <TagInput
                  selectedTagIds={formData.tagIds}
                  onChange={(v) => handleChange('tagIds', v)}
                  lang={formData.lang}
                />
              </div>
            </div>

            {/* Featured Image */}
            {contentType.postFormFields?.featuredImage && (
              <div className="card p-6">
                <h3 className="h2">{__('Featured Image')}</h3>
                <div className="mt-4 space-y-3">
                  {formData.featuredImage ? (
                    <div className="post-form-image-preview relative">
                      <img
                        src={formData.featuredImage}
                        alt={formData.featuredImageAlt || 'Preview'}
                        className="h-32 w-full rounded-md border border-(--border-primary) object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          handleChange('featuredImage', '');
                          handleChange('featuredImageAlt', '');
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
                  {formData.featuredImage && (
                    <div className="post-form-image-actions flex gap-2">
                      <button
                        type="button"
                        onClick={() => setShowMediaPicker(true)}
                        className="text-xs text-(--color-brand-600) hover:text-(--color-brand-700)"
                      >
                        {__('Change')}
                      </button>
                    </div>
                  )}
                  {formData.featuredImage && (
                    <div>
                      <label className="block text-sm font-medium text-(--text-secondary)">
                        {__('Alt Text')}
                      </label>
                      <input
                        type="text"
                        value={formData.featuredImageAlt}
                        onChange={(e) => handleChange('featuredImageAlt', e.target.value)}
                        className="input mt-1"
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
          handleChange('featuredImage', url);
          if (alt) handleChange('featuredImageAlt', alt);
        }}
      />

      {/* Internal Link Dialog */}
      <InternalLinkDialog
        isOpen={linkPickerOpen}
        onClose={closeLinkPicker}
        onSelect={handleLinkSelect}
      />
    </CmsFormShell>
  );
}
