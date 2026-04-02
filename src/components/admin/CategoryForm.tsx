'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';

import { getContentType } from '@/config/cms';
import { adminPanel } from '@/config/routes';
import { trpc } from '@/lib/trpc/client';
import { slugify } from '@/engine/lib/slug';
import { useBlankTranslations } from '@/lib/translations';
import { useSession } from '@/lib/auth-client';
import { ContentStatus } from '@/engine/types/cms';
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
import { RevisionHistory } from '@/engine/components/RevisionHistory';
import { RichTextEditor } from '@/engine/components/RichTextEditor';
import { shortcodeConfig } from '@/lib/shortcodes/config';
import { SEOFields } from '@/engine/components/SEOFields';
import { SeoPreviewCard } from '@/engine/components/SeoPreviewCard';
import { TagInput } from '@/engine/components/TagInput';
import { TranslationBar } from './TranslationBar';

interface CategoryFormData extends Record<string, unknown> {
  name: string;
  slug: string;
  title: string;
  text: string;
  status: number;
  lang: string;
  icon: string;
  order: number;
  metaDescription: string;
  seoTitle: string;
  noindex: boolean;
  publishedAt: string;
  tagIds: string[];
  fallbackToDefault: boolean | null;
}

const categoryContentType = getContentType('category');

interface Props {
  categoryId?: string;
}

export function CategoryForm({ categoryId }: Props) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !categoryId;

  // UI-only state (not part of form data)
  const [slugManual, setSlugManual] = useState(false);

  // Fetch existing category (wait for session to avoid UNAUTHORIZED on first render)
  const existingCat = trpc.categories.get.useQuery(
    { id: categoryId! },
    { enabled: !!categoryId && !!session }
  );

  // Fetch translation siblings (edit mode only)
  const translationSiblings = trpc.categories.getTranslationSiblings.useQuery(
    { id: categoryId! },
    { enabled: !!categoryId && !!session }
  );

  const cat = existingCat.data;

  // Compute initial form data from category
  const initialFormData: CategoryFormData = useMemo(() => {
    if (!cat) {
      return {
        name: '', slug: '', title: '', text: '', status: ContentStatus.DRAFT,
        lang: DEFAULT_LOCALE, icon: '', order: 0, metaDescription: '', seoTitle: '',
        noindex: false, publishedAt: '', tagIds: [], fallbackToDefault: null,
      };
    }
    return {
      name: cat.name,
      slug: cat.slug,
      title: cat.title,
      text: cat.text,
      status: cat.status,
      lang: cat.lang ?? DEFAULT_LOCALE,
      icon: cat.icon ?? '',
      order: cat.order,
      metaDescription: cat.metaDescription ?? '',
      seoTitle: cat.seoTitle ?? '',
      noindex: cat.noindex ?? false,
      publishedAt: cat.publishedAt ? convertUTCToLocal(cat.publishedAt) : '',
      tagIds: cat.tagIds ?? [],
      fallbackToDefault: cat.fallbackToDefault ?? null,
    };
  }, [cat]);

  const {
    formData, setFormData,
    fieldErrors, handleChange, handleSaveError,
  } = useCmsFormState<CategoryFormData>(initialFormData, 'info');

  // Sync form data when category loads
  useEffect(() => {
    if (cat) {
      setFormData(initialFormData);
      setSlugManual(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cat]);

  // Auto-generate slug from name (new categories only)
  useEffect(() => {
    if (!slugManual && isNew) {
      handleChange('slug', slugify(formData.name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, slugManual, isNew]);

  // Auto-fill title from name (new categories only, until user edits title)
  const [titleManual, setTitleManual] = useState(false);
  useEffect(() => {
    if (isNew && !titleManual) {
      handleChange('title', formData.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, titleManual, isNew]);

  // New hooks
  const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();
  const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();
  const duplicateAsTranslation = trpc.categories.duplicateAsTranslation.useMutation();
  const translationAvailableQuery = trpc.options.translationAvailable.useQuery();
  const customFieldsRef = useRef<CustomFieldsEditorHandle>(null);

  const createCat = trpc.categories.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(formData);
      customFieldsRef.current?.save(data.id).catch((err: unknown) => {
        console.error('[CategoryForm] Failed to save custom fields', err);
      });
      toast.success(__('Category created'));
      utils.categories.list.invalidate();
      utils.categories.counts.invalidate();
      router.push(adminPanel.cmsItem('categories', data.id));
    },
    onError: (err) => handleSaveError(err, 'Failed to create category'),
  });

  const updateCat = trpc.categories.update.useMutation({
    onSuccess: () => {
      clearAutosave(formData);
      if (categoryId) customFieldsRef.current?.save(categoryId).catch((err: unknown) => {
        console.error('[CategoryForm] Failed to save custom fields', err);
      });
      toast.success(__('Category updated'));
      utils.categories.list.invalidate();
      existingCat.refetch();
      // Post-save link validation
      validateLinks(formData.text);
    },
    onError: (err) => handleSaveError(err, 'Failed to update category'),
  });

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
    formData,
    initialData: initialFormData,
    dbUpdatedAt: existingCat.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!categoryId && existingCat.isLoading,
  });

  // Keyboard shortcuts
  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 's',
          ctrl: true,
          handler: () => {
            const form = document.getElementById('category-form') as HTMLFormElement;
            form?.requestSubmit();
          },
        },
      ],
      []
    )
  );

  const handleRestore = useCallback(() => {
    if (!recoveredData) return;
    const d = recoveredData.formData;
    setFormData({
      name: d.name as string,
      slug: d.slug as string,
      title: d.title as string,
      text: d.text as string,
      status: d.status as number,
      lang: d.lang as string,
      icon: d.icon as string,
      order: d.order as number,
      metaDescription: d.metaDescription as string,
      seoTitle: d.seoTitle as string,
      noindex: d.noindex as boolean,
      publishedAt: d.publishedAt as string,
      tagIds: d.tagIds as string[],
      fallbackToDefault: d.fallbackToDefault as boolean | null,
    });
    setSlugManual(true);
    acceptRecovery();
  }, [recoveredData, acceptRecovery, setFormData]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isNew) {
      createCat.mutate({
        name: formData.name,
        slug: formData.slug,
        lang: formData.lang,
        title: formData.title || formData.name,
        text: formData.text,
        status: formData.status,
        icon: formData.icon || undefined,
        order: formData.order,
        metaDescription: formData.metaDescription || undefined,
        seoTitle: formData.seoTitle || undefined,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : undefined,
        tagIds: formData.tagIds.length > 0 ? formData.tagIds : undefined,
        fallbackToDefault: formData.fallbackToDefault ?? undefined,
      });
    } else {
      updateCat.mutate({
        id: categoryId!,
        name: formData.name,
        slug: formData.slug,
        title: formData.title || formData.name,
        text: formData.text,
        status: formData.status,
        icon: formData.icon || null,
        order: formData.order,
        metaDescription: formData.metaDescription || null,
        seoTitle: formData.seoTitle || null,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : null,
        tagIds: formData.tagIds,
        fallbackToDefault: formData.fallbackToDefault,
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
        <button
          type="button"
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push(adminPanel.cms('categories'));
          }}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Category') : __('Edit Category')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        <button
          type="submit"
          form="category-form"
          disabled={isSaving || !formData.name}
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

      <form id="category-form" onSubmit={handleSubmit}>
        <div className="category-form-layout grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="category-form-main space-y-6 lg:col-span-2">
            <div className="card p-6">
              <div className="category-form-fields space-y-4">
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Name')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="input mt-1"
                    placeholder={__('Category name')}
                  />
                </div>
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Slug')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.slug}
                    onChange={(e) => {
                      handleChange('slug', e.target.value);
                      setSlugManual(true);
                    }}
                    className="input mt-1 font-mono"
                  />
                </div>
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Title')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.title}
                    onChange={(e) => {
                      handleChange('title', e.target.value);
                      setTitleManual(true);
                    }}
                    className="input mt-1"
                    placeholder={__('Display title (can differ from name)')}
                  />
                </div>
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Icon')}
                  </label>
                  <input
                    type="text"
                    value={formData.icon}
                    onChange={(e) => handleChange('icon', e.target.value)}
                    className="input mt-1"
                    placeholder={__('Icon name or URL')}
                  />
                </div>
              </div>
            </div>

            <div className="card p-6">
              <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
                {__('Description')}
              </label>
              <RichTextEditor
                content={formData.text}
                onChange={(v) => handleChange('text', v)}
                placeholder={__('Category description...')}
                storageKey={`category-${cat?.id ?? 'new'}`}
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
              title={formData.seoTitle || formData.name}
              description={formData.metaDescription}
              slug={formData.slug}
              urlPrefix="/category/"
            />

            {/* Custom Fields */}
            <CustomFieldsEditor
              ref={customFieldsRef}
              contentType="category"
              contentId={categoryId}
              isAuthenticated={!!session}
            />

            {/* Revision History */}
            {!isNew && categoryId && (
              <RevisionHistory
                contentType="category"
                contentId={categoryId}
                currentData={formData}
                onRestored={() => existingCat.refetch()}
              />
            )}
          </div>

          <div className="category-form-sidebar space-y-6">
            {/* Tags */}
            <div className="card p-6">
              <h3 className="h2">{__('Tags')}</h3>
              <div className="mt-4">
                <TagInput
                  selectedTagIds={formData.tagIds}
                  onChange={(v) => handleChange('tagIds', v)}
                  lang={formData.lang}
                />
              </div>
            </div>

            <div className="card p-6">
              <h3 className="h2">{__('Status')}</h3>
              <div className="mt-4 space-y-4">
                <div className="field-group">
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange('status', Number(e.target.value))}
                    className="select w-full"
                  >
                    <option value={ContentStatus.DRAFT}>{__('Draft')}</option>
                    <option value={ContentStatus.PUBLISHED}>
                      {__('Published')}
                    </option>
                  </select>
                </div>
                <div className="field-group">
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Order')}
                  </label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => handleChange('order', Number(e.target.value))}
                    className="input mt-1"
                  />
                </div>
                <div className="field-group">
                  {cat && translationSiblings.data ? (
                    <TranslationBar
                      currentLang={formData.lang}
                      translations={translationSiblings.data}
                      adminSlug="categories"
                      translationAvailable={translationAvailableQuery.data?.available ?? false}
                      onDuplicate={async (targetLang, autoTranslate) => {
                        const result = await duplicateAsTranslation.mutateAsync({
                          id: cat.id,
                          targetLang,
                          autoTranslate,
                        });
                        router.push(adminPanel.cmsItem('categories', result.id));
                      }}
                    />
                  ) : (
                    <div>
                      <label className="block text-sm font-medium text-(--text-secondary)">
                        {__('Language')}
                      </label>
                      <select
                        value={formData.lang}
                        disabled={!isNew}
                        onChange={(e) => handleChange('lang', e.target.value)}
                        className="select mt-1 w-full disabled:bg-(--surface-secondary)"
                      >
                        {LOCALES.map((l) => (
                          <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {cat && (
                  <FallbackRadio
                    value={formData.fallbackToDefault}
                    onChange={(v) => handleChange('fallbackToDefault', v)}
                    ct={categoryContentType}
                  />
                )}

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
              </div>
            </div>
          </div>
        </div>
      </form>

      {/* Internal Link Dialog */}
      <InternalLinkDialog
        isOpen={linkPickerOpen}
        onClose={closeLinkPicker}
        onSelect={handleLinkSelect}
      />
    </CmsFormShell>
  );
}
