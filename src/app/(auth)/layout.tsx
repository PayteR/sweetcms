import '@/engine/styles/tokens-public.css';
import '@/engine/styles/content.css';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--surface-secondary)">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
