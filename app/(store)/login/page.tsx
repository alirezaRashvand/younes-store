import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { isDevelopmentOtpEnabled } from "@/lib/env";
import { firstParam } from "@/lib/search-params";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { getCurrentUser } from "@/features/auth/session";
import { LoginForm } from "@/components/auth/login-form";

export const instant = false;

export const metadata: Metadata = {
  title: "ورود / ثبت‌نام",
  robots: { index: false, follow: false },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = safeRedirectPath(firstParam((await searchParams).next), "/");

  // Already signed in: skip the form.
  if (await getCurrentUser()) redirect(next);

  return (
    <div className="container-page flex justify-center py-12 sm:py-20">
      <div className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <header className="space-y-2 text-center">
          <h1 className="text-2xl font-extrabold">ورود / ثبت‌نام</h1>
          <p className="text-sm text-muted-foreground">
            برای ورود یا ساخت حساب، شماره موبایل خود را وارد کنید.
          </p>
        </header>
        <LoginForm next={next} showDevHint={isDevelopmentOtpEnabled()} />
      </div>
    </div>
  );
}
