import { headers } from 'next/headers';
import { auth } from '@/lib/auth';

export default async function AccountPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session!.user;
  const userImage = (user as { image?: string | null }).image;

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Account Overview</h1>

      <div className="account-card rounded-lg border border-(--border-primary) p-6 mb-6">
        <div className="flex items-center gap-4">
          {userImage ? (
            <img src={userImage} alt="" className="w-16 h-16 rounded-full object-cover" />
          ) : (
            <div className="w-16 h-16 rounded-full bg-(--color-brand-500) flex items-center justify-center text-white text-2xl font-medium">
              {(user.name?.[0] ?? '?').toUpperCase()}
            </div>
          )}
          <div>
            <h2 className="text-lg font-semibold">{user.name}</h2>
            <p className="text-sm text-(--text-secondary)">{user.email}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <a href="/account/settings" className="account-card rounded-lg border border-(--border-primary) p-4 hover:bg-(--surface-secondary) transition-colors">
          <h3 className="font-medium">Profile Settings</h3>
          <p className="text-sm text-(--text-secondary) mt-1">Update your name and profile information.</p>
        </a>
        <a href="/account/security" className="account-card rounded-lg border border-(--border-primary) p-4 hover:bg-(--surface-secondary) transition-colors">
          <h3 className="font-medium">Security</h3>
          <p className="text-sm text-(--text-secondary) mt-1">Change your password and manage sessions.</p>
        </a>
        <a href="/account/billing" className="account-card rounded-lg border border-(--border-primary) p-4 hover:bg-(--surface-secondary) transition-colors">
          <h3 className="font-medium">Billing</h3>
          <p className="text-sm text-(--text-secondary) mt-1">Manage your subscription and payment methods.</p>
        </a>
      </div>
    </div>
  );
}
