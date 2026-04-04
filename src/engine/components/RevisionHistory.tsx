'use client';

import { useCallback, useMemo, useState } from 'react';

import { History, RotateCcw, X } from 'lucide-react';

import { useBlankTranslations } from '@/engine/lib/translations';
import { computeFieldDiffs } from '@/engine/lib/revision-diff';
import type { FieldDiff } from '@/engine/lib/revision-diff';
import { trpc } from '@/lib/trpc/client';
import { toast } from '@/engine/store/toast-store';
import { Dialog } from '@/engine/components/Dialog';
import { cn } from '@/lib/utils';

interface Props {
  contentType: string;
  contentId: string;
  currentData: Record<string, unknown>;
  onRestored?: () => void;
  /** When true, auto-opens the dialog on mount and hides the trigger card. */
  dialogOnly?: boolean;
  /** Called when the dialog is closed (relevant when dialogOnly is true). */
  onClose?: () => void;
}

export function RevisionHistory({ contentType, contentId, currentData, onRestored, dialogOnly, onClose }: Props) {
  const __ = useBlankTranslations();
  const [isOpen, setIsOpen] = useState(dialogOnly ?? false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [restoreTarget, setRestoreTarget] = useState<string | null>(null);

  const { data: revisionCount } = trpc.revisions.count.useQuery(
    { contentType, contentId },
  );

  const revisions = trpc.revisions.list.useQuery(
    { contentType, contentId },
    { enabled: isOpen }
  );

  const restore = trpc.revisions.restore.useMutation({
    onSuccess: () => {
      toast.success(__('Revision restored'));
      onRestored?.();
    },
    onError: (err) => toast.error(err.message),
  });

  const selectedRevision = revisions.data?.[selectedIndex];
  const snapshot = selectedRevision?.snapshot as Record<string, unknown> | undefined;

  const diffs = useMemo<FieldDiff[]>(() => {
    if (!snapshot) return [];
    return computeFieldDiffs(snapshot, currentData);
  }, [snapshot, currentData]);

  const openDialog = useCallback(() => {
    setIsOpen(true);
    setSelectedIndex(0);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    setSelectedIndex(0);
    onClose?.();
  }, [onClose]);

  function handleRestore() {
    if (!restoreTarget) return;
    restore.mutate({ id: restoreTarget });
    setRestoreTarget(null);
  }

  // ── Revision dialog using engine Dialog component ──
  const dialogElement = (
    <>
      <Dialog
        open={isOpen}
        onClose={closeDialog}
        className="max-w-5xl! h-[85vh]"
      >
        {/* Header */}
        <Dialog.Header onClose={closeDialog}>
          {__('Revision History')}
        </Dialog.Header>

        {/* Timeline slider */}
        {revisions.data && revisions.data.length > 1 && (
          <div className="border-b border-(--border-primary) px-5 py-3">
            <input
              type="range"
              min={0}
              max={revisions.data.length - 1}
              value={revisions.data.length - 1 - selectedIndex}
              onChange={(e) =>
                setSelectedIndex(revisions.data!.length - 1 - Number(e.target.value))
              }
              className="w-full"
            />
            <div className="flex justify-between text-xs text-(--text-muted)">
              <span>{__('Oldest')}</span>
              <span>{__('Newest')}</span>
            </div>
          </div>
        )}

        {/* Body: split panel */}
        {!revisions.data?.length ? (
          <div className="flex-1 p-8 text-center text-(--text-muted)">
            {__('No revisions yet')}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {/* Left panel — revision list */}
            <div className="flex w-[35%] flex-col border-r border-(--border-primary)">
              <div className="flex-1 overflow-y-auto p-3">
                <div className="space-y-1">
                  {revisions.data.map((rev, idx) => {
                    const snap = rev.snapshot as Record<string, unknown>;
                    const title = (snap.title as string) || (snap.name as string) || __('(untitled)');
                    return (
                      <button
                        key={rev.id}
                        type="button"
                        onClick={() => setSelectedIndex(idx)}
                        className={cn(
                          'w-full rounded-md px-3 py-2 text-left transition-colors',
                          selectedIndex === idx
                            ? 'bg-[oklch(0.55_0.20_var(--brand-hue)_/_0.12)] text-(--color-brand-600) dark:text-(--color-brand-400)'
                            : 'text-(--text-secondary) hover:bg-(--surface-secondary)',
                        )}
                      >
                        <div className="truncate text-sm font-medium">{title}</div>
                        <div className="text-xs text-(--text-muted)">
                          {new Date(rev.createdAt).toLocaleString()}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Right panel — field diffs */}
            <div className="flex w-[65%] flex-col">
              <div className="flex-1 overflow-y-auto p-4">
                {diffs.length === 0 ? (
                  <div className="py-8 text-center text-(--text-muted)">
                    {__('No changes in this revision')}
                  </div>
                ) : (
                  <div className="space-y-4">
                    {diffs.map((diff) => (
                      <div key={diff.key}>
                        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-(--text-muted)">
                          {diff.label}
                        </div>
                        {diff.type === 'long' && diff.lines ? (
                          <div className="rounded border border-(--border-primary) bg-(--surface-secondary) p-2 font-mono text-xs">
                            {diff.lines.map((line, i) => (
                              <div
                                key={i}
                                className={cn(
                                  'whitespace-pre-wrap',
                                  line.type === 'added' && 'bg-green-500/10 text-green-600 dark:text-green-400',
                                  line.type === 'removed' && 'bg-red-500/10 text-red-600 dark:text-red-400',
                                  line.type === 'context' && 'text-(--text-muted)',
                                )}
                              >
                                {line.type === 'added' ? '+ ' : line.type === 'removed' ? '- ' : '  '}
                                {line.text}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm">
                            <del className="text-red-600 dark:text-red-400">{String(diff.oldValue ?? '')}</del>
                            <span className="mx-2 text-(--text-muted)">&rarr;</span>
                            <ins className="text-green-600 no-underline dark:text-green-400">{String(diff.newValue ?? '')}</ins>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {selectedRevision && (
                <div className="border-t border-(--border-primary) p-4 shrink-0">
                  <button
                    type="button"
                    onClick={() => setRestoreTarget(selectedRevision.id)}
                    disabled={restore.isPending}
                    className="btn btn-primary flex items-center gap-2"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {__('Restore this version')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </Dialog>

      {/* Restore confirmation */}
      <Dialog open={!!restoreTarget} onClose={() => setRestoreTarget(null)} size="sm">
        <Dialog.Body>
          <h3 className="text-lg font-semibold text-(--text-primary)">{__('Restore revision?')}</h3>
          <p className="mt-2 text-sm text-(--text-secondary)">
            {__('This will overwrite the current content with the selected revision. Continue?')}
          </p>
        </Dialog.Body>
        <Dialog.Footer>
          <button onClick={() => setRestoreTarget(null)} className="btn btn-secondary">
            {__('Cancel')}
          </button>
          <button onClick={handleRestore} className="btn btn-primary">
            {__('Restore')}
          </button>
        </Dialog.Footer>
      </Dialog>
    </>
  );

  // In dialogOnly mode, skip the card trigger
  if (dialogOnly) {
    return dialogElement;
  }

  return (
    <div className="card p-6">
      <button
        type="button"
        onClick={openDialog}
        className="flex w-full items-center gap-2"
      >
        <h3 className="h2 flex items-center gap-2">
          <History className="h-4 w-4" />
          {__('Revisions')}
          {(revisionCount ?? 0) > 0 && (
            <span className="rounded-full bg-(--surface-secondary) px-2 py-0.5 text-xs text-(--text-muted)">
              {revisionCount}
            </span>
          )}
        </h3>
      </button>
      {dialogElement}
    </div>
  );
}
