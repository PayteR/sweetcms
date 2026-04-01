'use client';

import { useState } from 'react';
import type { ShortcodeDef } from '@/lib/shortcodes/registry';
import { useBlankTranslations } from '@/lib/translations';
import { Dialog } from '@/engine/components/Dialog';

interface Props {
  def: ShortcodeDef;
  attrs: Record<string, string>;
  content: string;
  onSave: (attrs: Record<string, string>, content: string) => void;
  onClose: () => void;
}

export function ShortcodeEditDialog({ def, attrs, content, onSave, onClose }: Props) {
  const __ = useBlankTranslations();
  const [formAttrs, setFormAttrs] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const attr of def.attrs) {
      initial[attr.name] = attrs[attr.name] ?? attr.default ?? '';
    }
    return initial;
  });
  const [formContent, setFormContent] = useState(content);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSave(formAttrs, formContent);
  }

  return (
    <Dialog open onClose={onClose} size="md">
      <Dialog.Header onClose={onClose}>{__(`Edit ${def.label}`)}</Dialog.Header>
      <Dialog.Body>
        <form id="shortcode-edit-form" onSubmit={handleSubmit} className="space-y-4">
          {def.attrs.map((attr) => (
            <div key={attr.name}>
              <label className="admin-label">{attr.name}</label>
              {attr.type === 'select' ? (
                <select
                  value={formAttrs[attr.name] ?? ''}
                  onChange={(e) =>
                    setFormAttrs((prev) => ({ ...prev, [attr.name]: e.target.value }))
                  }
                  className="admin-select mt-1"
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
                  className="admin-textarea mt-1"
                />
              ) : (
                <input
                  type="text"
                  value={formAttrs[attr.name] ?? ''}
                  onChange={(e) =>
                    setFormAttrs((prev) => ({ ...prev, [attr.name]: e.target.value }))
                  }
                  className="admin-input mt-1"
                />
              )}
            </div>
          ))}

          {def.hasContent && (
            <div>
              <label className="admin-label">{__('Content')}</label>
              <textarea
                value={formContent}
                onChange={(e) => setFormContent(e.target.value)}
                rows={4}
                className="admin-textarea mt-1"
              />
            </div>
          )}
        </form>
      </Dialog.Body>
      <Dialog.Footer>
        <button type="button" onClick={onClose} className="admin-btn admin-btn-secondary">
          {__('Cancel')}
        </button>
        <button type="submit" form="shortcode-edit-form" className="admin-btn admin-btn-primary">
          {__('Save')}
        </button>
      </Dialog.Footer>
    </Dialog>
  );
}
