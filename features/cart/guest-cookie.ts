import "server-only";

import { cookies } from "next/headers";
import { generateToken } from "@/lib/crypto";

export const GUEST_CART_COOKIE_NAME = "younes_guest_cart";
export const GUEST_CART_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const GUEST_TOKEN_MIN_LENGTH = 32;

export function isPlausibleGuestToken(token: string | undefined | null): token is string {
  return (
    typeof token === "string" &&
    token.length >= GUEST_TOKEN_MIN_LENGTH &&
    token.length <= 200 &&
    /^[A-Za-z0-9_-]+$/.test(token)
  );
}

export async function getGuestCartToken(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(GUEST_CART_COOKIE_NAME)?.value;
  return isPlausibleGuestToken(value) ? value : null;
}

/** Only callable from Server Actions / Route Handlers. Raw token lives only in this cookie. */
export async function setGuestCartToken(token?: string): Promise<string> {
  const value = token ?? generateToken(32);
  const store = await cookies();
  store.set(GUEST_CART_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_CART_MAX_AGE_SECONDS,
  });
  return value;
}

export async function clearGuestCartToken(): Promise<void> {
  const store = await cookies();
  store.set(GUEST_CART_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
