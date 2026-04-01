'use client';

import { useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Eye, EyeOff, Settings2 } from 'lucide-react';

import { useBlankTranslations } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { SlideOver } from '@/engine/components/SlideOver';
import { DASHBOARD_WIDGETS, DEFAULT_WIDGET_ORDER, DEFAULT_HIDDEN_WIDGETS } from '@/config/dashboard-widgets';
import { usePreferencesStore } from '@/store/preferences-store';

// ── Sortable widget row ─────────────────────────────────────
function SortableWidgetRow({
  id,
  label,
  isHidden,
  onToggle,
  __,
}: {
  id: string;
  label: string;
  isHidden: boolean;
  onToggle: () => void;
  __: (s: string) => string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'flex items-center gap-3 rounded-lg border border-(--border-secondary) px-3 py-2.5',
        'bg-(--surface-secondary)',
        isHidden && 'opacity-50'
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none text-(--text-muted) hover:text-(--text-primary)"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      <span className={cn('flex-1 text-sm font-medium text-(--text-primary)', isHidden && 'line-through')}>
        {label}
      </span>

      <button
        type="button"
        onClick={onToggle}
        className="rounded-md p-1 text-(--text-muted) hover:bg-(--surface-inset) hover:text-(--text-primary)"
        title={isHidden ? __('Show widget') : __('Hide widget')}
      >
        {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

// ── Dashboard Config SlideOver content (only mounted when open) ──
function DashboardConfigPanel({ __}: { __: (s: string) => string }) {
  const widgetOrder = usePreferencesStore((s) =>
    (s.data['dashboard.widgetOrder'] as string[] | undefined) ?? DEFAULT_WIDGET_ORDER
  );
  const hiddenWidgets = usePreferencesStore((s) =>
    (s.data['dashboard.hiddenWidgets'] as string[] | undefined) ?? DEFAULT_HIDDEN_WIDGETS
  );
  const setPreference = usePreferencesStore((s) => s.set);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // Build ordered list — include any widgets not in the saved order at the end
  const allIds = DASHBOARD_WIDGETS.map((w) => w.id);
  const orderedIds = [
    ...widgetOrder.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !widgetOrder.includes(id)),
  ];

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = orderedIds.indexOf(active.id as string);
    const newIndex = orderedIds.indexOf(over.id as string);
    if (oldIndex === -1 || newIndex === -1) return;

    const newOrder = [...orderedIds];
    newOrder.splice(oldIndex, 1);
    newOrder.splice(newIndex, 0, active.id as string);

    setPreference('dashboard.widgetOrder', newOrder);
  }

  function toggleWidget(id: string) {
    const current = new Set(hiddenWidgets);
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    setPreference('dashboard.hiddenWidgets', [...current]);
  }

  const widgetMap = Object.fromEntries(DASHBOARD_WIDGETS.map((w) => [w.id, w]));

  return (
    <>
      <p className="mb-4 text-sm text-(--text-secondary)">
        {__('Drag to reorder widgets. Toggle visibility with the eye icon.')}
      </p>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedIds} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-2">
            {orderedIds.map((id) => {
              const widget = widgetMap[id];
              if (!widget) return null;
              return (
                <SortableWidgetRow
                  key={id}
                  id={id}
                  label={__(widget.label)}
                  isHidden={hiddenWidgets.includes(id)}
                  onToggle={() => toggleWidget(id)}
                  __={__}
                />
              );
            })}
          </div>
        </SortableContext>
      </DndContext>
    </>
  );
}

// ── Dashboard Config Button + SlideOver ─────────────────────
export function DashboardConfig() {
  const __ = useBlankTranslations();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="admin-btn admin-btn-secondary admin-btn-sm"
        title={__('Configure dashboard')}
      >
        <Settings2 className="h-4 w-4" />
      </button>

      <SlideOver open={open} onClose={() => setOpen(false)} title={__('Dashboard Layout')} width="sm">
        <DashboardConfigPanel __={__} />
      </SlideOver>
    </>
  );
}
