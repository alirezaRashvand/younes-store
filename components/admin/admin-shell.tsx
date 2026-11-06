import { AdminHeader } from "@/components/admin/admin-header";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

interface AdminShellProps {
  /** Result of `requireAdminPage()` — resolve it in the layout, behind <Suspense>. */
  user: { name: string | null; phoneNumber: string };
  storeName?: string;
  children: React.ReactNode;
}

/**
 * Admin chrome: fixed steel sidebar on the start side (right in RTL) ≥ lg,
 * sheet-based nav below. Pure layout — no data fetching, safe to prerender.
 */
export function AdminShell({ user, storeName, children }: AdminShellProps) {
  return (
    <div className="min-h-dvh bg-muted/40">
      <aside className="fixed inset-y-0 start-0 z-40 hidden w-64 border-e border-sidebar-border lg:block">
        <AdminSidebar storeName={storeName} />
      </aside>
      <div className="flex min-h-dvh flex-col lg:ps-64">
        <AdminHeader user={user} storeName={storeName} />
        <main id="admin-main" className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
