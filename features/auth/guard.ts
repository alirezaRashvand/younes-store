import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, type SessionUser } from "@/features/auth/session";
import { isAdmin } from "@/features/auth/permissions";
import { safeRedirectPath } from "@/lib/safe-redirect";

/** Header set by proxy.ts so layouts (which don't know the URL) can build `next`. */
export const NEXT_PATH_HEADER = "x-next-path";

export function buildLoginUrl(next: string | null | undefined): string {
  const safe = safeRedirectPath(next, "");
  return safe ? `/login?next=${encodeURIComponent(safe)}` : "/login";
}

async function resolveNextPath(explicit?: string): Promise<string> {
  if (explicit) return safeRedirectPath(explicit, "/");
  const h = await headers();
  return safeRedirectPath(h.get(NEXT_PATH_HEADER), "/");
}

/** For pages/layouts that need a signed-in user. Redirects to /login?next=... */
export async function requireUserPage(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(buildLoginUrl(await resolveNextPath(next)));
  return user;
}

/**
 * For admin layouts/pages. Not signed in -> /login?next=...;
 * signed in but not an admin -> home page.
 * This is the authoritative check; proxy.ts only does an optimistic cookie check.
 */
export async function requireAdminPage(next?: string): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect(buildLoginUrl(await resolveNextPath(next)));
  if (!isAdmin(user)) redirect("/");
  return user;
}
