'use client';

import { useState, useRef } from 'react';
import {
  X,
  Upload,
  Loader2,
  Image as ImageIcon,
  Check,
} from 'lucide-react';

import { trpc } from '@/lib/trpc/client';
import { useBlankTranslations } from '@/lib/translations';
import { FileType } from '@/engine/types/cms';
import { toast } from '@/store/toast-store';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string, alt?: string) => void;
}

export function MediaPickerDialog({ open, onClose, onSelect }: Props) {
  const __ = useBlankTranslations();
  const utils = trpc.useUtils();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const mediaList = trpc.media.list.useQuery(
    { page, pageSize: 20, fileType: FileType.IMAGE },
    { enabled: open }
  );

  const registerMedia = trpc.media.register.useMutation({
    onSuccess: () => utils.media.list.invalidate(),
    onError: (err) => toast.error(err.message),
  });

  const data = mediaList.data;
  const selectedItem = data?.results.find((m) => m.id === selectedId);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);

    for (const file of Array.from(files)) {
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json();
          toast.error(err.error ?? 'Upload failed');
          continue;
        }
        const result = await res.json();
        await registerMedia.mutateAsync({
          filename: result.filename,
          filepath: result.filepath,
          mimeType: result.mimeType,
          fileSize: result.fileSize,
        });
      } catch {
        toast.error(__(`Failed to upload ${file.name}`));
      }
    }

    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleConfirm() {
    if (!selectedItem) return;
    onSelect(selectedItem.url, selectedItem.altText ?? undefined);
    onClose();
    setSelectedId(null);
  }

  if (!open) return null;

  return (
    <div className="admin-media-picker-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="admin-media-picker-panel mx-4 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-(--surface-primary) shadow-xl">
        {/* Header */}
        <div className="admin-media-picker-header flex items-center justify-between border-b border-(--border-primary) px-6 py-4">
          <h2 className="text-lg font-semibold text-(--text-primary)">
            {__('Select Image')}
          </h2>
          <div className="admin-media-picker-header-actions flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*"
              onChange={handleUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="admin-btn admin-btn-secondary"
            >
              {uploading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {__('Upload')}
            </button>
            <button
              onClick={() => {
                onClose();
                setSelectedId(null);
              }}
              className="rounded p-1 text-(--text-muted) hover:bg-(--surface-secondary) hover:text-(--text-secondary)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Grid */}
        <div className="admin-media-picker-body flex-1 overflow-y-auto p-6">
          {mediaList.isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-(--text-muted)" />
            </div>
          ) : (data?.results ?? []).length === 0 ? (
            <div className="admin-media-picker-empty flex flex-col items-center justify-center py-12">
              <ImageIcon className="h-12 w-12 text-(--text-muted)" />
              <p className="admin-media-picker-empty-text mt-4 text-sm text-(--text-muted)">
                {__('No images yet. Upload one above.')}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
                {(data?.results ?? []).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedId(item.id)}
                    className={cn(
                      'group relative aspect-square overflow-hidden rounded-lg border-2 transition-colors',
                      selectedId === item.id
                        ? 'border-(--color-brand-500) ring-2 ring-(--color-brand-200) dark:ring-[oklch(0.65_0.17_var(--brand-hue)_/_0.25)]'
                        : 'border-transparent hover:border-(--border-primary)'
                    )}
                  >
                    <img
                      src={item.url}
                      alt={item.altText ?? item.filename}
                      className="h-full w-full object-cover"
                    />
                    {selectedId === item.id && (
                      <div className="absolute inset-0 flex items-center justify-center bg-(--color-brand-500)/20">
                        <div className="rounded-full bg-(--color-brand-500) p-1">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      </div>
                    )}
                  </button>
                ))}
              </div>

              {data && data.totalPages > 1 && (
                <div className="mt-4 flex justify-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="admin-btn admin-btn-secondary text-xs disabled:opacity-40"
                  >
                    {__('Previous')}
                  </button>
                  <span className="admin-media-picker-page-indicator px-3 py-1 text-xs text-(--text-muted)">
                    {page} / {data.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page >= data.totalPages}
                    className="admin-btn admin-btn-secondary text-xs disabled:opacity-40"
                  >
                    {__('Next')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="admin-media-picker-footer flex items-center justify-between border-t border-(--border-primary) px-6 py-4">
          <div className="admin-media-picker-selection-label text-sm text-(--text-muted)">
            {selectedItem ? selectedItem.filename : __('No image selected')}
          </div>
          <div className="admin-media-picker-footer-actions flex gap-2">
            <button
              onClick={() => {
                onClose();
                setSelectedId(null);
              }}
              className="admin-btn admin-btn-secondary"
            >
              {__('Cancel')}
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedItem}
              className="admin-btn admin-btn-primary disabled:opacity-50"
            >
              {__('Select')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
