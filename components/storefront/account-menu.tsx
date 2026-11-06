import Link from "next/link";
import { connection } from "next/server";
import { UserRoundIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentSession } from "@/features/auth/session";
import { AccountMenuClient } from "@/components/storefront/account-menu-client";

export function AccountMenuFallback() {
  return (
    <span
      aria-hidden="true"
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "pointer-events-none")}
    >
      <UserRoundIcon className="text-muted-foreground" />
    </span>
  );
}

/**
 * Async server component: reads the session cookie → render inside
 * <Suspense fallback={<AccountMenuFallback />}>.
 */
export async function AccountMenu() {
  // Dynamic before try/catch so the hanging-cookies rejection is never swallowed.
  await connection();
  let session = null;
  try {
    session = await getCurrentSession();
  } catch (error) {
    console.error("[storefront] failed to load session", error);
  }

  if (!session) {
    return (
      <Link
        href={routes.login}
        className={cn(buttonVariants({ variant: "default", size: "sm" }), "gap-1.5")}
      >
        <UserRoundIcon aria-hidden="true" />
        ورود / ثبت‌نام
      </Link>
    );
  }

  const { user } = session;
  return (
    <AccountMenuClient
      name={user.name}
      phoneNumber={user.phoneNumber}
      isAdmin={user.role === "ADMIN"}
    />
  );
}
