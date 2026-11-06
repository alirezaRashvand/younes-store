import type { Metadata } from "next";
import Link from "next/link";

import { routes } from "@/lib/routes";
import { UserRole } from "@/generated/prisma/client";
import { requireUserPage } from "@/features/auth/guard";
import { ProfileForm } from "@/components/account/profile-form";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/shared/page-header";

export const instant = false;

export const metadata: Metadata = {
  title: "حساب کاربری",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  // Redirects to /login?next=/account when there is no valid session.
  const user = await requireUserPage(routes.account);
  const isAdmin = user.role === UserRole.ADMIN;

  return (
    <div className="container-page py-8">
      <PageHeader
        title="حساب کاربری"
        description="اطلاعات حساب خود را مشاهده و ویرایش کنید."
        actions={
          isAdmin ? (
            <Button asChild variant="outline">
              <Link href={routes.admin.root}>پنل مدیریت</Link>
            </Button>
          ) : null
        }
      />
      <div className="max-w-xl rounded-xl border bg-card p-6">
        <ProfileForm
          phoneNumber={user.phoneNumber}
          name={user.name}
          canEditName={user.role === UserRole.CUSTOMER}
        />
      </div>
    </div>
  );
}
