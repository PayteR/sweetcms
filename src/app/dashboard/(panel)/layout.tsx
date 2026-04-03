import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { DashboardShellWrapper } from '@/components/admin/DashboardShellWrapper';
import { PreferencesHydrator } from '@/engine/components/PreferencesHydrator';
import { Toaster } from '@/engine/components/Toaster';

export default function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <AdminSidebar />
      <PreferencesHydrator />
      <DashboardShellWrapper>{children}</DashboardShellWrapper>
      <Toaster />
    </>
  );
}
