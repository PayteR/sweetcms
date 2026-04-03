import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { DashboardShell } from '@/engine/components/DashboardShell';
import { PreferencesHydrator } from '@/components/admin/PreferencesHydrator';
import { Toaster } from '@/engine/components/Toaster';
import { navigation } from '@/config/admin-nav';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminSidebar />
      <PreferencesHydrator />
      <DashboardShell navigation={navigation}>{children}</DashboardShell>
      <Toaster />
    </>
  );
}
