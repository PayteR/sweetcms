'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2 } from 'lucide-react';
import Link from 'next/link';

import { adminPanel } from '@/config/routes';
import { trpc } from '@/lib/trpc/client';
import { slugify } from '@/engine/lib/slug';
import { useBlankTranslations } from '@/lib/translations';
import { useSession } from '@/lib/auth-client';
import { ContentStatus } from '@/engine/types/cms';
import { toast } from '@/store/toast-store';
import { DEFAULT_LOCALE, LOCALES, LOCALE_LABELS } from '@/lib/constants';

interface Props {
  tagId?: string;
}

export function TermForm({ tagId }: Props) {
  const __ = useBlankTranslations();
  const router = useRouter();
  const utils = trpc.useUtils();
  const { data: session } = useSession();
  const isNew = !tagId;

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [status, setStatus] = useState<number>(ContentStatus.PUBLISHED);
  const [lang, setLang] = useState(DEFAULT_LOCALE);
  const [order, setOrder] = useState(0);

  const existingTag = trpc.tags.get.useQuery(
    { id: tagId! },
    { enabled: !!tagId && !!session }
  );

  useEffect(() => {
    if (existingTag.data) {
      const t = existingTag.data;
      setName(t.name);
      setSlug(t.slug);
      setSlugManual(true);
      setStatus(t.status);
      setLang(t.lang);
      setOrder(t.order);
    }
  }, [existingTag.data]);

  useEffect(() => {
    if (!slugManual && isNew) {
      setSlug(slugify(name));
    }
  }, [name, slugManual, isNew]);

  const createTag = trpc.tags.create.useMutation({
    onSuccess: (data) => {
      toast.success(__('Tag created'));
      utils.tags.list.invalidate();
      utils.tags.counts.invalidate();
      router.push(adminPanel.cmsItem('tags', data.id));
    },
    onError: (err) => toast.error(err.message),
  });

  const updateTag = trpc.tags.update.useMutation({
    onSuccess: () => {
      toast.success(__('Tag updated'));
      utils.tags.list.invalidate();
      existingTag.refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const isSaving = createTag.isPending || updateTag.isPending;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (isNew) {
      createTag.mutate({
        name,
        slug,
        lang,
        status,
        order,
      });
    } else {
      updateTag.mutate({
        id: tagId!,
        name,
        slug,
        status,
        order,
      });
    }
  }

  if (!isNew && existingTag.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
      </div>
    );
  }

  return (
    <div className="term-form-page">
      <div className="term-form-header flex items-center justify-between">
        <div className="term-form-header-left flex items-center gap-3">
          <Link
            href={adminPanel.cms('tags')}
            className="rounded-md p-1.5 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-2xl font-bold text-(--text-primary)">
            {isNew ? __('New Tag') : __('Edit Tag')}
          </h1>
        </div>
        <button
          type="submit"
          form="term-form"
          disabled={isSaving || !name}
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

      <form id="term-form" onSubmit={handleSubmit} className="mt-6">
        <div className="term-form-layout grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="term-form-main space-y-6 lg:col-span-2">
            <div className="card p-6">
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
                    className="input mt-1"
                    placeholder={__('Tag name')}
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
                    className="input mt-1 font-mono"
                    placeholder="url-slug"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="term-form-sidebar space-y-6">
            <div className="card p-6">
              <h3 className="h2">{__('Status')}</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <select
                    value={status}
                    onChange={(e) => setStatus(Number(e.target.value))}
                    className="select w-full"
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
                    className="input mt-1"
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
                    className="select mt-1 w-full disabled:bg-(--surface-secondary)"
                  >
                    {LOCALES.map((l) => (
                      <option key={l} value={l}>{LOCALE_LABELS[l]}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
