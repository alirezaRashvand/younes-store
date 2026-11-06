import { Suspense } from "react";
import type { Metadata } from "next";
import { requireAdminPage } from "@/features/auth/guard";
import { getStoreName } from "@/features/store-settings/service";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminShellSkeleton } from "@/components/admin/admin-skeleton";

/** Everything under /admin depends on the session cookie, so it is rendered per request. */
export const instant = false;

export const metadata: Metadata = {
  title: { default: "پنل مدیریت", template: "%s | پنل مدیریت" },
  robots: { index: false, follow: false },
};

async function AdminGate({ children }: { children: React.ReactNode }) {
  // Authoritative check (proxy.ts only looks for the cookie). Not signed in -> /login,
  // signed in but not an admin -> home.
  const user = await requireAdminPage();
  const storeName = await getStoreName();

  return (
    <AdminShell user={{ name: user.name, phoneNumber: user.phoneNumber }} storeName={storeName}>
      {children}
    </AdminShell>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<AdminShellSkeleton />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}
