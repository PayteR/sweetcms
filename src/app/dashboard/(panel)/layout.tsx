import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { DashboardShell } from '@/components/admin/DashboardShell';
import { PreferencesHydrator } from '@/components/admin/PreferencesHydrator';
import { Toaster } from '@/components/ui/Toaster';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminSidebar />
      <PreferencesHydrator />
      <DashboardShell>{children}</DashboardShell>
      <Toaster />
    </>
  );
}
