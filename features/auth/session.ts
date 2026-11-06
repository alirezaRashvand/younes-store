import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/crypto";
import type { UserRole } from "@/generated/prisma/client";

export const SESSION_COOKIE_NAME = "younes_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  id: string;
  phoneNumber: string;
  name: string | null;
  role: UserRole;
}

export interface CurrentSession {
  sessionId: string;
  expiresAt: Date;
  user: SessionUser;
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    expires,
  };
}

/** Creates a DB-backed session and sets the cookie. Only the SHA-256 hash is stored. */
export async function createSession(userId: string): Promise<{ expiresAt: Date }> {
  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);

  await prisma.session.create({
    data: { userId, hashedToken: sha256(token), expiresAt },
  });

  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, token, cookieOptions(expiresAt));
  return { expiresAt };
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(SESSION_COOKIE_NAME)?.value;
  return value && value.length >= 20 && value.length <= 200 ? value : null;
}

/** Request-memoized session lookup. Never mutates cookies (safe in Server Components). */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  const token = await getSessionToken();
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { hashedToken: sha256(token) },
    select: {
      id: true,
      expiresAt: true,
      revokedAt: true,
      user: {
        select: { id: true, phoneNumber: true, name: true, role: true },
      },
    },
  });

  if (!session) return null;
  if (session.revokedAt !== null) return null;
  if (session.expiresAt.getTime() <= Date.now()) return null;

  return { sessionId: session.id, expiresAt: session.expiresAt, user: session.user };
});

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getCurrentSession();
  return session?.user ?? null;
}

/** Clears the cookie. Only callable from Server Actions / Route Handlers. */
export async function destroySessionCookie(): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE_NAME, "", { ...cookieOptions(new Date(0)), maxAge: 0 });
}

export async function revokeSession(sessionId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await prisma.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Revokes the current session (if any) and removes the cookie. */
export async function logout(): Promise<void> {
  const token = await getSessionToken();
  if (token) {
    await prisma.session.updateMany({
      where: { hashedToken: sha256(token), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  await destroySessionCookie();
}
