import type { DashboardWidgetDef } from '@/engine/config/dashboard-widgets';

export type { DashboardWidgetDef } from '@/engine/config/dashboard-widgets';

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { id: 'content-status', label: 'Content Status', colSpan: 6, minSpan: 4, maxSpan: 12, defaultVisible: true },
  { id: 'quick-actions', label: 'Quick Actions', colSpan: 6, minSpan: 4, maxSpan: 12, defaultVisible: true },
  { id: 'ga4', label: 'Google Analytics', colSpan: 12, minSpan: 6, maxSpan: 12, defaultVisible: true },
  { id: 'recent-activity', label: 'Recent Activity', colSpan: 12, minSpan: 6, maxSpan: 12, defaultVisible: true },
];

export const DEFAULT_WIDGET_ORDER = DASHBOARD_WIDGETS.map((w) => w.id);

export const DEFAULT_HIDDEN_WIDGETS: string[] = [];
