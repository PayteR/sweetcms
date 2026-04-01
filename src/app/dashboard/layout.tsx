import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { DashboardShell } from '@/components/admin/DashboardShell';
import { PreferencesHydrator } from '@/components/admin/PreferencesHydrator';
import { Toaster } from '@/components/ui/Toaster';
import './assets/admin.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div data-admin>
      <AdminSidebar />
      <PreferencesHydrator />
      <DashboardShell>{children}</DashboardShell>
      <Toaster />
    </div>
  );
}
