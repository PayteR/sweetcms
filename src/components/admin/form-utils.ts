import { toast } from '@/engine/store/toast-store';
import type { RefObject } from 'react';

interface CustomFieldsHandle {
  save: (itemId: string) => Promise<void>;
}

interface OnSaveSuccessOpts<T extends Record<string, unknown>> {
  clearAutosave: (formData: T) => void;
  formData: T;
  customFieldsRef: RefObject<CustomFieldsHandle | null>;
  /** Known item ID for update mutations; omit for create (pass itemId via onAfter). */
  itemId?: string;
  successMessage: string;
  invalidate: () => void;
  refetch?: () => void;
  /** Called after all common steps. Useful for create mutations that need router.push. */
  onAfter?: () => void;
}

/**
 * Creates a standard onSuccess callback for CMS form save mutations.
 * Handles: clear autosave → save custom fields → toast → invalidate → optional refetch/onAfter.
 *
 * For update mutations, pass `itemId` directly.
 * For create mutations, omit `itemId` here and call customFieldsRef.current?.save() in `onAfter`
 * (where you also have access to the newly created item's ID from the mutation response).
 */
export function makeOnSaveSuccess<T extends Record<string, unknown>>(
  opts: OnSaveSuccessOpts<T>
) {
  return () => {
    opts.clearAutosave(opts.formData);
    if (opts.itemId) {
      opts.customFieldsRef.current?.save(opts.itemId).catch((err: unknown) => {
        console.error('[form] Failed to save custom fields', err);
      });
    }
    toast.success(opts.successMessage);
    opts.invalidate();
    opts.refetch?.();
    opts.onAfter?.();
  };
}
