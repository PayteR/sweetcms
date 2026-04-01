'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

import { LOCALES, type Locale } from '@/lib/constants';
import { useBlankTranslations } from '@/lib/translations';
import { trpc } from '@/lib/trpc/client';

interface SelectedRoute {
  slug: string;
  label: string;
  lang: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (selected: SelectedRoute[]) => void;
  isPending: boolean;
}

const LOCALE_LABELS: Record<Locale, string> = {
  en: 'EN',
  es: 'ES',
  de: 'DE',
};

export function SeoOverridesDialog({
  open,
  onClose,
  onConfirm,
  isPending,
}: Props) {
  const __ = useBlankTranslations();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const { data, isLoading } = trpc.cms.getSeoOverrideStatus.useQuery(
    undefined,
    { enabled: open }
  );

  useEffect(() => {
    if (open) {
      dialogRef.current?.showModal();
    } else {
      dialogRef.current?.close();
    }
  }, [open]);

  // Group data by slug for row-based rendering
  const routes = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { slug: string; label: string; locales: Record<string, boolean> }
    >();
    for (const item of data) {
      let entry = map.get(item.slug);
      if (!entry) {
        entry = { slug: item.slug, label: item.label, locales: {} };
        map.set(item.slug, entry);
      }
      entry.locales[item.lang] = item.exists;
    }
    return [...map.values()];
  }, [data]);

  const isChecked = useCallback(
    (slug: string, lang: string) => {
      return checked[`${lang}:${slug}`] ?? false;
    },
    [checked]
  );

  const toggleCheck = useCallback((slug: string, lang: string) => {
    const key = `${lang}:${slug}`;
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const toggleLangColumn = useCallback(
    (lang: string) => {
      const missing = routes.filter((r) => !r.locales[lang]);
      const allChecked = missing.every((r) => checked[`${lang}:${r.slug}`]);
      setChecked((prev) => {
        const next = { ...prev };
        for (const r of missing) {
          next[`${lang}:${r.slug}`] = !allChecked;
        }
        return next;
      });
    },
    [routes, checked]
  );

  const isLangAllChecked = useCallback(
    (lang: string) => {
      const missing = routes.filter((r) => !r.locales[lang]);
      return missing.length > 0 && missing.every((r) => checked[`${lang}:${r.slug}`]);
    },
    [routes, checked]
  );

  const handleClose = useCallback(() => {
    setChecked({});
    onClose();
  }, [onClose]);

  const selected = useMemo(() => {
    const result: SelectedRoute[] = [];
    for (const route of routes) {
      for (const lang of LOCALES) {
        if (route.locales[lang]) continue;
        if (isChecked(route.slug, lang)) {
          result.push({ slug: route.slug, label: route.label, lang });
        }
      }
    }
    return result;
  }, [routes, isChecked]);

  const handleConfirm = useCallback(() => {
    if (selected.length > 0) {
      onConfirm(selected);
    }
  }, [selected, onConfirm]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={handleClose}
      className="fixed inset-0 z-50 m-auto w-full max-w-2xl rounded-lg border border-(--border-primary) bg-(--surface-primary) p-0 shadow-xl backdrop:bg-black/30"
    >
      <div className="admin-seo-overrides-body p-6">
        <h3 className="text-lg font-semibold text-(--text-primary)">
          {__('Create SEO Override Pages')}
        </h3>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-(--text-secondary)" />
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-(--border-primary)">
                  <th className="px-3 py-2 text-left text-xs font-medium text-(--text-secondary)">
                    {__('Route')}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-(--text-secondary)">
                    {__('Slug')}
                  </th>
                  {LOCALES.map((lang) => (
                    <th
                      key={lang}
                      className="px-3 py-2 text-center text-xs font-medium text-(--text-secondary)"
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span>{LOCALE_LABELS[lang]}</span>
                        <input
                          type="checkbox"
                          checked={isLangAllChecked(lang)}
                          onChange={() => toggleLangColumn(lang)}
                          className="h-4 w-4 cursor-pointer"
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => (
                  <tr
                    key={route.slug}
                    className="border-b border-(--border-primary)/50"
                  >
                    <td className="px-3 py-2 text-(--text-primary)">
                      {route.label}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-(--text-secondary)">
                      /{route.slug}
                    </td>
                    {LOCALES.map((lang) => {
                      const exists = route.locales[lang];
                      return (
                        <td key={lang} className="px-3 py-2 text-center">
                          {exists ? (
                            <Check className="mx-auto h-4 w-4 text-green-500" />
                          ) : (
                            <input
                              type="checkbox"
                              checked={isChecked(route.slug, lang)}
                              onChange={() => toggleCheck(route.slug, lang)}
                              className="h-4 w-4 cursor-pointer"
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="admin-seo-overrides-actions mt-6 flex justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isPending}
            className="admin-btn admin-btn-secondary"
          >
            {__('Cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={isPending || selected.length === 0}
            className="admin-btn admin-btn-primary flex items-center gap-2"
          >
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {__('Create Selected')} ({selected.length})
          </button>
        </div>
      </div>
    </dialog>
  );
}
