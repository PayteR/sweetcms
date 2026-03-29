'use client';

import { useEffect, useRef, useState } from 'react';
import type { ShortcodeDef } from '@/lib/shortcodes/registry';
import { useBlankTranslations } from '@/lib/translations';

interface Props {
  def: ShortcodeDef;
  attrs: Record<string, string>;
  content: string;
  onSave: (attrs: Record<string, string>, content: string) => void;
  onClose: () => void;
}

export function ShortcodeEditDialog({ def, attrs, content, onSave, onClose }: Props) {
  const __ = useBlankTranslations();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [formAttrs, setFormAttrs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const attr of def.attrs) {
      initial[attr.name] = attrs[attr.name] ?? attr.default ?? '';
    }
    return initial;
  });
  const [formContent, setFormContent] = useState(content);

  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(formAttrs, formContent);
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="fixed inset-0 z-50 m-auto w-full max-w-md rounded-lg border border-(--border-primary) bg-(--surface-primary) p-6 shadow-xl backdrop:bg-black/30"
    >
      <h3 className="text-lg font-semibold text-(--text-primary)">
        {__(`Edit ${def.label}`)}
      </h3>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        {def.attrs.map((attr) => (
          <div key={attr.name}>
            <label className="block text-sm font-medium text-(--text-secondary)">
              {attr.name}
            </label>
            {attr.type === 'select' ? (
              <select
                value={formAttrs[attr.name] ?? ''}
                onChange={(e) =>
                  setFormAttrs((prev) => ({ ...prev, [attr.name]: e.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary)"
              >
                {attr.options?.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : attr.type === 'textarea' ? (
              <textarea
                value={formAttrs[attr.name] ?? ''}
                onChange={(e) =>
                  setFormAttrs((prev) => ({ ...prev, [attr.name]: e.target.value }))
                }
                rows={3}
                className="mt-1 block w-full rounded-md border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary)"
              />
            ) : (
              <input
                type="text"
                value={formAttrs[attr.name] ?? ''}
                onChange={(e) =>
                  setFormAttrs((prev) => ({ ...prev, [attr.name]: e.target.value }))
                }
                className="mt-1 block w-full rounded-md border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary)"
              />
            )}
          </div>
        ))}

        {def.hasContent && (
          <div>
            <label className="block text-sm font-medium text-(--text-secondary)">
              {__('Content')}
            </label>
            <textarea
              value={formContent}
              onChange={(e) => setFormContent(e.target.value)}
              rows={4}
              className="mt-1 block w-full rounded-md border border-(--border-primary) bg-(--surface-primary) px-3 py-2 text-sm text-(--text-primary)"
            />
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="admin-btn admin-btn-secondary"
          >
            {__('Cancel')}
          </button>
          <button type="submit" className="admin-btn admin-btn-primary">
            {__('Save')}
          </button>
        </div>
      </form>
    </dialog>
  );
}
