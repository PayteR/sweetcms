'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, X } from 'lucide-react';

import { getContentType } from '@/config/cms';
import { trpc } from '@/lib/trpc/client';
import { slugify } from '@/lib/slug';
import { useBlankTranslations } from '@/lib/translations';
import { useSession } from '@/lib/auth-client';
import { ContentStatus } from '@/types/cms';
import { toast } from '@/store/toast-store';
import { DEFAULT_LOCALE } from '@/lib/constants';
import { convertUTCToLocal, convertLocalToUTC } from '@/lib/datetime';
import { useCmsFormState } from '@/hooks/useCmsFormState';
import { useLinkPicker } from '@/hooks/useLinkPicker';
import { useLinkValidation } from '@/hooks/useLinkValidation';
import { useCmsAutosave } from '@/hooks/useCmsAutosave';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import AutosaveIndicator from './AutosaveIndicator';
import AutosaveRecoveryBanner from './AutosaveRecoveryBanner';
import BrokenLinksBanner from './BrokenLinksBanner';
import CmsFormShell from './CmsFormShell';
import { CustomFieldsEditor, type CustomFieldsEditorHandle } from './CustomFieldsEditor';
import { FallbackRadio } from './FallbackRadio';
import InternalLinkDialog from './InternalLinkDialog';
import { MediaPickerDialog } from './MediaPickerDialog';
import { RevisionHistory } from './RevisionHistory';
import { RichTextEditor } from './RichTextEditor';
import { SEOFields } from './SEOFields';
import { SeoPreviewCard } from './SeoPreviewCard';
import { TagInput } from './TagInput';
import { TranslationBar } from './TranslationBar';

interface PortfolioFormData extends Record<string, unknown> {
  name: string;
  slug: string;
  title: string;
  text: string;
  status: number;
  lang: string;
  metaDescription: string;
  seoTitle: string;
  noindex: boolean;
  publishedAt: string;
  tagIds: string[];
  fallbackToDefault: boolean | null;
  featuredImage: string;
  featuredImageAlt: string;
  clientName: string;
  projectUrl: string;
  techStack: string[];
  completedAt: string;
}

const portfolioContentType = getContentType('portfolio');

interface Props {
  portfolioId?: string;
}

export function PortfolioForm({ portfolioId }: Props) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !portfolioId;

  const [slugManual, setSlugManual] = useState(false);
  const [titleManual, setTitleManual] = useState(false);
  const [techInput, setTechInput] = useState('');
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  // Fetch existing portfolio item
  const existingItem = trpc.portfolio.get.useQuery(
    { id: portfolioId! },
    { enabled: !!portfolioId && !!session }
  );

  const translationSiblings = trpc.portfolio.getTranslationSiblings.useQuery(
    { id: portfolioId! },
    { enabled: !!portfolioId && !!session }
  );

  const item = existingItem.data;

  const initialFormData: PortfolioFormData = useMemo(() => {
    if (!item) {
      return {
        name: '', slug: '', title: '', text: '', status: ContentStatus.DRAFT,
        lang: DEFAULT_LOCALE, metaDescription: '', seoTitle: '',
        noindex: false, publishedAt: '', tagIds: [], fallbackToDefault: null,
        featuredImage: '', featuredImageAlt: '',
        clientName: '', projectUrl: '', techStack: [], completedAt: '',
      };
    }
    return {
      name: item.name,
      slug: item.slug,
      title: item.title,
      text: item.text,
      status: item.status,
      lang: item.lang ?? DEFAULT_LOCALE,
      metaDescription: item.metaDescription ?? '',
      seoTitle: item.seoTitle ?? '',
      noindex: item.noindex ?? false,
      publishedAt: item.publishedAt ? convertUTCToLocal(item.publishedAt) : '',
      tagIds: item.tagIds ?? [],
      fallbackToDefault: item.fallbackToDefault ?? null,
      featuredImage: item.featuredImage ?? '',
      featuredImageAlt: item.featuredImageAlt ?? '',
      clientName: item.clientName ?? '',
      projectUrl: item.projectUrl ?? '',
      techStack: item.techStack ?? [],
      completedAt: item.completedAt ? convertUTCToLocal(item.completedAt) : '',
    };
  }, [item]);

  const {
    formData, setFormData,
    fieldErrors, handleChange, handleSaveError,
  } = useCmsFormState<PortfolioFormData>(initialFormData, 'info');

  useEffect(() => {
    if (item) {
      setFormData(initialFormData);
      setSlugManual(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item]);

  useEffect(() => {
    if (!slugManual && isNew) {
      handleChange('slug', slugify(formData.name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, slugManual, isNew]);

  useEffect(() => {
    if (isNew && !titleManual) {
      handleChange('title', formData.name);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.name, titleManual, isNew]);

  const { linkPickerOpen, openLinkPicker, closeLinkPicker, handleLinkSelect, editorRef } = useLinkPicker();
  const { brokenLinks, validateLinks, dismissBrokenLinks } = useLinkValidation();
  const duplicateAsTranslation = trpc.portfolio.duplicateAsTranslation.useMutation();
  const translationAvailableQuery = trpc.options.translationAvailable.useQuery();
  const customFieldsRef = useRef<CustomFieldsEditorHandle>(null);

  const createItem = trpc.portfolio.create.useMutation({
    onSuccess: (data) => {
      clearAutosave(formData);
      customFieldsRef.current?.save(data.id).catch(() => {});
      toast.success(__('Portfolio item created'));
      utils.portfolio.list.invalidate();
      utils.portfolio.counts.invalidate();
      router.push(`/dashboard/cms/portfolio/${data.id}`);
    },
    onError: (err) => handleSaveError(err, 'Failed to create portfolio item'),
  });

  const updateItem = trpc.portfolio.update.useMutation({
    onSuccess: () => {
      clearAutosave(formData);
      if (portfolioId) customFieldsRef.current?.save(portfolioId).catch(() => {});
      toast.success(__('Portfolio item updated'));
      utils.portfolio.list.invalidate();
      existingItem.refetch();
      validateLinks(formData.text);
    },
    onError: (err) => handleSaveError(err, 'Failed to update portfolio item'),
  });

  const isSaving = createItem.isPending || updateItem.isPending;

  const {
    isDirty,
    recoveredData,
    acceptRecovery,
    dismissRecovery,
    lastAutosaveAt,
    clearAutosave,
  } = useCmsAutosave({
    contentTypeId: 'portfolio',
    contentId: portfolioId ?? null,
    formData,
    initialData: initialFormData,
    dbUpdatedAt: existingItem.data?.updatedAt ?? null,
    saving: isSaving,
    loading: !!portfolioId && existingItem.isLoading,
  });

  useKeyboardShortcuts(
    useMemo(
      () => [
        {
          key: 's',
          ctrl: true,
          handler: () => {
            const form = document.getElementById('portfolio-form') as HTMLFormElement;
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
      metaDescription: d.metaDescription as string,
      seoTitle: d.seoTitle as string,
      noindex: d.noindex as boolean,
      publishedAt: d.publishedAt as string,
      tagIds: d.tagIds as string[],
      fallbackToDefault: d.fallbackToDefault as boolean | null,
      featuredImage: d.featuredImage as string,
      featuredImageAlt: d.featuredImageAlt as string,
      clientName: d.clientName as string,
      projectUrl: d.projectUrl as string,
      techStack: d.techStack as string[],
      completedAt: d.completedAt as string,
    });
    setSlugManual(true);
    acceptRecovery();
  }, [recoveredData, acceptRecovery, setFormData]);

  function addTechItem(value: string) {
    const trimmed = value.trim();
    if (trimmed && !formData.techStack.includes(trimmed)) {
      handleChange('techStack', [...formData.techStack, trimmed]);
    }
    setTechInput('');
  }

  function removeTechItem(index: number) {
    handleChange('techStack', formData.techStack.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isNew) {
      createItem.mutate({
        name: formData.name,
        slug: formData.slug,
        lang: formData.lang,
        title: formData.title || formData.name,
        text: formData.text,
        status: formData.status,
        metaDescription: formData.metaDescription || undefined,
        seoTitle: formData.seoTitle || undefined,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : undefined,
        tagIds: formData.tagIds.length > 0 ? formData.tagIds : undefined,
        fallbackToDefault: formData.fallbackToDefault ?? undefined,
        featuredImage: formData.featuredImage || undefined,
        featuredImageAlt: formData.featuredImageAlt || undefined,
        clientName: formData.clientName || undefined,
        projectUrl: formData.projectUrl || undefined,
        techStack: formData.techStack.length > 0 ? formData.techStack : undefined,
        completedAt: formData.completedAt ? convertLocalToUTC(formData.completedAt) : undefined,
      });
    } else {
      updateItem.mutate({
        id: portfolioId!,
        name: formData.name,
        slug: formData.slug,
        title: formData.title || formData.name,
        text: formData.text,
        status: formData.status,
        metaDescription: formData.metaDescription || null,
        seoTitle: formData.seoTitle || null,
        noindex: formData.noindex,
        publishedAt: formData.publishedAt ? convertLocalToUTC(formData.publishedAt) : null,
        tagIds: formData.tagIds,
        fallbackToDefault: formData.fallbackToDefault,
        featuredImage: formData.featuredImage || null,
        featuredImageAlt: formData.featuredImageAlt || null,
        clientName: formData.clientName || null,
        projectUrl: formData.projectUrl || null,
        techStack: formData.techStack,
        completedAt: formData.completedAt ? convertLocalToUTC(formData.completedAt) : null,
      });
    }
  }

  if (!isNew && existingItem.isLoading) {
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
            else router.push('/dashboard/cms/portfolio');
          }}
          className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-(--text-primary)">
          {isNew ? __('New Portfolio Item') : __('Edit Portfolio Item')}
        </h1>
      </div>
      <div className="flex items-center gap-2">
        <AutosaveIndicator lastAutosaveAt={lastAutosaveAt} isDirty={isDirty} />
        <button
          type="submit"
          form="portfolio-form"
          disabled={isSaving || !formData.name}
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

      <BrokenLinksBanner urls={brokenLinks} onDismiss={dismissBrokenLinks} />

      <form id="portfolio-form" onSubmit={handleSubmit}>
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
                    value={formData.name}
                    onChange={(e) => handleChange('name', e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={__('Project name')}
                  />
                </div>
                <div>
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
                    value={formData.title}
                    onChange={(e) => {
                      handleChange('title', e.target.value);
                      setTitleManual(true);
                    }}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={__('Display title')}
                  />
                </div>
              </div>
            </div>

            {/* Portfolio-specific fields */}
            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Project Details')}</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Client Name')}
                  </label>
                  <input
                    type="text"
                    value={formData.clientName}
                    onChange={(e) => handleChange('clientName', e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={__('Client or company name')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Project URL')}
                  </label>
                  <input
                    type="url"
                    value={formData.projectUrl}
                    onChange={(e) => handleChange('projectUrl', e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://example.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Tech Stack')}
                  </label>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {formData.techStack.map((tech, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-500/15 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-400"
                      >
                        {tech}
                        <button
                          type="button"
                          onClick={() => removeTechItem(i)}
                          className="ml-0.5 rounded-full p-0.5 hover:bg-blue-100 dark:hover:bg-blue-500/20"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    value={techInput}
                    onChange={(e) => setTechInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ',') && techInput.trim()) {
                        e.preventDefault();
                        addTechItem(techInput);
                      }
                    }}
                    onBlur={() => { if (techInput.trim()) addTechItem(techInput); }}
                    className="mt-2 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder={__('Type and press Enter or comma to add')}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Completion Date')}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.completedAt}
                    onChange={(e) => handleChange('completedAt', e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>

            <div className="admin-card p-6">
              <label className="mb-2 block text-sm font-medium text-(--text-secondary)">
                {__('Description')}
              </label>
              <RichTextEditor
                content={formData.text}
                onChange={(v) => handleChange('text', v)}
                placeholder={__('Project description...')}
                storageKey={`portfolio-${item?.id ?? 'new'}`}
                onRequestLinkPicker={openLinkPicker}
                editorRef={editorRef}
              />
            </div>

            {/* SEO */}
            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('SEO')}</h3>
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

            <SeoPreviewCard
              title={formData.seoTitle || formData.name}
              description={formData.metaDescription}
              slug={formData.slug}
              urlPrefix="/portfolio/"
            />

            <CustomFieldsEditor
              ref={customFieldsRef}
              contentType="portfolio"
              contentId={portfolioId}
            />

            {!isNew && portfolioId && (
              <RevisionHistory
                contentType="portfolio"
                contentId={portfolioId}
                currentData={formData}
                onRestored={() => existingItem.refetch()}
              />
            )}
          </div>

          <div className="space-y-6">
            {/* Featured Image */}
            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Featured Image')}</h3>
              <div className="mt-4">
                {formData.featuredImage ? (
                  <div className="relative">
                    <img
                      src={formData.featuredImage}
                      alt={formData.featuredImageAlt || ''}
                      className="w-full rounded-md object-cover"
                      style={{ maxHeight: '200px' }}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        handleChange('featuredImage', '');
                        handleChange('featuredImageAlt', '');
                      }}
                      className="absolute right-2 top-2 rounded-full bg-red-600 p-1 text-white hover:bg-red-700"
                    >
                      <X className="h-3 w-3" />
                    </button>
                    <input
                      type="text"
                      value={formData.featuredImageAlt}
                      onChange={(e) => handleChange('featuredImageAlt', e.target.value)}
                      className="mt-2 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder={__('Alt text')}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setMediaPickerOpen(true)}
                    className="admin-btn admin-btn-secondary w-full"
                  >
                    {__('Select Image')}
                  </button>
                )}
              </div>
            </div>

            {/* Tags */}
            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Tags')}</h3>
              <div className="mt-4">
                <TagInput
                  selectedTagIds={formData.tagIds}
                  onChange={(v) => handleChange('tagIds', v)}
                  lang={formData.lang}
                />
              </div>
            </div>

            <div className="admin-card p-6">
              <h3 className="admin-h2">{__('Status')}</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <select
                    value={formData.status}
                    onChange={(e) => handleChange('status', Number(e.target.value))}
                    className="block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={ContentStatus.DRAFT}>{__('Draft')}</option>
                    <option value={ContentStatus.PUBLISHED}>
                      {__('Published')}
                    </option>
                  </select>
                </div>
                <div>
                  {item && translationSiblings.data ? (
                    <TranslationBar
                      currentLang={formData.lang}
                      translations={translationSiblings.data}
                      adminSlug="portfolio"
                      translationAvailable={translationAvailableQuery.data?.available ?? false}
                      onDuplicate={async (targetLang, autoTranslate) => {
                        const result = await duplicateAsTranslation.mutateAsync({
                          id: item.id,
                          targetLang,
                          autoTranslate,
                        });
                        router.push(`/dashboard/cms/portfolio/${result.id}`);
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
                        className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm disabled:bg-(--surface-secondary)"
                      >
                        <option value="en">English</option>
                      </select>
                    </div>
                  )}
                </div>

                {item && (
                  <FallbackRadio
                    value={formData.fallbackToDefault}
                    onChange={(v) => handleChange('fallbackToDefault', v)}
                    ct={portfolioContentType}
                  />
                )}

                <div>
                  <label className="block text-sm font-medium text-(--text-secondary)">
                    {__('Publish Date')}
                  </label>
                  <input
                    type="datetime-local"
                    value={formData.publishedAt}
                    onChange={(e) => handleChange('publishedAt', e.target.value)}
                    className="mt-1 block w-full rounded-md border border-(--border-primary) px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>

      <InternalLinkDialog
        isOpen={linkPickerOpen}
        onClose={closeLinkPicker}
        onSelect={handleLinkSelect}
      />

      <MediaPickerDialog
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        onSelect={(url) => {
          handleChange('featuredImage', url);
          setMediaPickerOpen(false);
        }}
      />
    </CmsFormShell>
  );
}
