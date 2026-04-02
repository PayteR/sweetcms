'use client';

import { type ComponentType, type ReactNode, useRef, useState } from 'react';
import Link from 'next/link';
import { Clock, GripVertical } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

import { cn } from '@/lib/utils';
import { adminPanel } from '@/config/routes';
import { useBlankTranslations } from '@/lib/translations';
import { usePreferencesStore } from '@/engine/store/preferences-store';
import {
  DASHBOARD_WIDGETS,
  DEFAULT_WIDGET_ORDER,
  DEFAULT_HIDDEN_WIDGETS,
} from '@/config/dashboard-widgets';
import GA4Widget from '@/components/admin/GA4Widget';
import RecentActivity from '@/components/admin/RecentActivity';
import ContentStatusWidget from '@/components/admin/ContentStatusWidget';
import QuickActionsWidget from '@/components/admin/QuickActionsWidget';

// ── Widget component type ──────────────────────────────────
type WidgetComponent = ComponentType<{ dragHandle?: ReactNode }>;

// ── RecentActivity wrapper (was in page.tsx) ───────────────
function RecentActivityWidget({ dragHandle }: { dragHandle?: ReactNode }) {
  const __ = useBlankTranslations();

  return (
    <div className="card flex flex-col overflow-hidden">
      <div className="widget-header">
        <div className="flex items-center gap-2">
          {dragHandle}
          <h2 className="h2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-(--text-muted)" />
            {__('Recent Activity')}
          </h2>
        </div>
        <Link
          href={adminPanel.activity}
          className="text-xs font-medium text-(--text-muted) hover:text-(--text-primary) transition-colors"
        >
          {__('View all')}
        </Link>
      </div>
      <RecentActivity />
    </div>
  );
}

// ── Widget lookup ──────────────────────────────────────────
const WIDGET_MAP: Record<string, WidgetComponent> = {
  'content-status': ContentStatusWidget,
  'quick-actions': QuickActionsWidget,
  'ga4': GA4Widget,
  'recent-activity': RecentActivityWidget,
};

// ── Widget label lookup (for overlay) ──────────────────────
const widgetLabelMap = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w.label])
);

// ── ColSpan lookup from config defaults ────────────────────
const defaultSpanMap = Object.fromEntries(
  DASHBOARD_WIDGETS.map((w) => [w.id, w.colSpan])
);

/** Stable empty object for Zustand selector fallback */
const EMPTY_SPANS: Record<string, number> = {};

// ── Sortable widget item ───────────────────────────────────
function SortableWidget({
  id,
  colSpan,
}: {
  id: string;
  colSpan: number;
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
    opacity: isDragging ? 0.3 : 1,
    gridColumn: `span ${colSpan}`,
  };

  const Component = WIDGET_MAP[id];
  if (!Component) return null;

  const dragHandle = (
    <button
      type="button"
      aria-label={`Drag to reorder ${widgetLabelMap[id] ?? 'widget'}`}
      className={cn(
        'touch-none text-(--text-muted) hover:text-(--text-primary)',
        'opacity-0 group-hover/widget:opacity-100 focus-visible:opacity-100 transition-opacity',
        '-ml-1 mr-1 shrink-0',
        isDragging ? 'cursor-grabbing' : 'cursor-grab',
      )}
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group/widget max-sm:!col-span-full"
    >
      <Component dragHandle={dragHandle} />
    </div>
  );
}

// ── Main grid ──────────────────────────────────────────────
export function DashboardWidgetGrid() {
  const hydrated = usePreferencesStore((s) => s.hydrated);
  const widgetOrder = usePreferencesStore((s) =>
    (s.data['dashboard.widgetOrder'] as string[] | undefined) ?? DEFAULT_WIDGET_ORDER
  );
  const hiddenWidgets = usePreferencesStore((s) =>
    (s.data['dashboard.hiddenWidgets'] as string[] | undefined) ?? DEFAULT_HIDDEN_WIDGETS
  );
  const widgetSpans = usePreferencesStore((s) =>
    (s.data['dashboard.widgetSpans'] as Record<string, number> | undefined) ?? EMPTY_SPANS
  );
  const setPreference = usePreferencesStore((s) => s.set);
  const [activeId, setActiveId] = useState<string | null>(null);
  const dragWidthRef = useRef<number>(0);

  // Use defaults until preferences have hydrated from DB to avoid SSR mismatch
  const effectiveOrder = hydrated ? widgetOrder : DEFAULT_WIDGET_ORDER;
  const effectiveHidden = hydrated ? hiddenWidgets : DEFAULT_HIDDEN_WIDGETS;
  const effectiveSpans = hydrated ? widgetSpans : EMPTY_SPANS;

  // Build visible ordered list
  const allIds = DASHBOARD_WIDGETS.map((w) => w.id);
  const orderedIds = [
    ...effectiveOrder.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !effectiveOrder.includes(id)),
  ].filter((id) => !effectiveHidden.includes(id));

  function getColSpan(id: string): number {
    return effectiveSpans[id] ?? defaultSpanMap[id] ?? 12;
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragStart(event: DragStartEvent) {
    const rect = event.active.rect.current;
    dragWidthRef.current = rect.initial?.width ?? 0;
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Rebuild full order (including hidden) with the swap applied
    const fullOrder = [
      ...effectiveOrder.filter((id) => allIds.includes(id)),
      ...allIds.filter((id) => !effectiveOrder.includes(id)),
    ];
    const fullOldIndex = fullOrder.indexOf(active.id as string);
    const fullNewIndex = fullOrder.indexOf(over.id as string);
    if (fullOldIndex === -1 || fullNewIndex === -1) return;

    const newOrder = [...fullOrder];
    newOrder.splice(fullOldIndex, 1);
    newOrder.splice(fullNewIndex, 0, active.id as string);

    setPreference('dashboard.widgetOrder', newOrder);
  }

  function handleDragCancel() {
    setActiveId(null);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <SortableContext items={orderedIds} strategy={rectSortingStrategy}>
        <div className="mt-8 grid grid-cols-12 gap-4">
          {orderedIds.map((id) => (
            <SortableWidget
              key={id}
              id={id}
              colSpan={getColSpan(id)}
            />
          ))}
        </div>
      </SortableContext>

      <DragOverlay dropAnimation={null}>
        {activeId ? (
          <div
            className="card opacity-80 shadow-lg rounded-lg overflow-hidden"
            style={{ width: dragWidthRef.current || undefined }}
          >
            <div className="widget-header">
              <div className="flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-(--text-muted) shrink-0" />
                <span className="h2">{widgetLabelMap[activeId] ?? activeId}</span>
              </div>
            </div>
            <div className="px-4 py-6 text-center text-sm text-(--text-muted)">...</div>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
