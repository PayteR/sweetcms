'use client';

import { useCallback, useRef, useState } from 'react';

export function useBulkSelection(resetKey: string) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const prevResetKey = useRef(resetKey);

  // Clear selection when filters/page/tab change — sync in render
  if (prevResetKey.current !== resetKey) {
    prevResetKey.current = resetKey;
    setSelectedIds(new Set());
  }

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback((ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(ids);
    });
  }, []);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return {
    selectedIds,
    toggle,
    selectAll,
    deselectAll,
    selectedCount: selectedIds.size,
  };
}
