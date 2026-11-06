import "server-only";

import { UserRole } from "@/generated/prisma/client";
import {
  getCurrentUser,
  type SessionUser,
} from "@/features/auth/session";

/** Thrown when no valid session exists. Redirect-friendly: send to /login. */
export class AuthenticationError extends Error {
  readonly code = "UNAUTHENTICATED" as const;
  readonly redirectTo = "/login";
  constructor(message = "برای ادامه وارد حساب کاربری خود شوید.") {
    super(message);
    this.name = "AuthenticationError";
  }
}

/** Thrown when the user is signed in but lacks permission. */
export class AuthorizationError extends Error {
  readonly code = "FORBIDDEN" as const;
  readonly redirectTo = "/";
  constructor(message = "شما اجازه دسترسی به این بخش را ندارید.") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function isAdmin(user: Pick<SessionUser, "role"> | null | undefined): boolean {
  return user?.role === UserRole.ADMIN;
}

export function assertAdmin<T extends Pick<SessionUser, "role">>(
  user: T | null | undefined,
): asserts user is T {
  if (!user) throw new AuthenticationError();
  if (!isAdmin(user)) throw new AuthorizationError();
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthenticationError();
  return user;
}

export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  assertAdmin(user);
  return user;
}
