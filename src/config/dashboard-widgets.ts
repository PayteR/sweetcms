export interface DashboardWidgetDef {
  id: string;
  label: string;
  span: 'half' | 'full';
  defaultVisible: boolean;
}

export const DASHBOARD_WIDGETS: DashboardWidgetDef[] = [
  { id: 'content-status', label: 'Content Status', span: 'half', defaultVisible: true },
  { id: 'quick-actions', label: 'Quick Actions', span: 'half', defaultVisible: true },
  { id: 'ga4', label: 'Google Analytics', span: 'full', defaultVisible: true },
  { id: 'recent-activity', label: 'Recent Activity', span: 'full', defaultVisible: true },
];

export const DEFAULT_WIDGET_ORDER = DASHBOARD_WIDGETS.map((w) => w.id);

export const DEFAULT_HIDDEN_WIDGETS: string[] = [];
