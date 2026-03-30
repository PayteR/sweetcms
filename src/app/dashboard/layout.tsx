import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { AdminHeader } from '@/components/admin/AdminHeader';
import { Toaster } from '@/components/ui/Toaster';
import './assets/admin.css';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <AdminHeader />
      <AdminSidebar />
      <main className="min-h-dvh pt-14 xl:ml-60">
        <div className="bg-(--surface-secondary) p-6">{children}</div>
      </main>
      <Toaster />
    </div>
  );
}
