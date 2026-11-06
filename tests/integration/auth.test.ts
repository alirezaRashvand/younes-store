import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { UserRole } from "@/generated/prisma/client";
import {
  DEVELOPMENT_FIXED_OTP,
  DevelopmentOtpProvider,
  OTP_MAX_ATTEMPTS,
  getOtpProvider,
} from "@/features/auth/otp-provider";
import {
  AuthenticationError,
  AuthorizationError,
  requireAdmin,
  requireUser,
} from "@/features/auth/permissions";
import {
  SESSION_COOKIE_NAME,
  getCurrentSession,
  getCurrentUser,
} from "@/features/auth/session";
import { requestOtpAction, verifyOtpAction, logoutAction } from "@/features/auth/actions";
import { GUEST_CART_COOKIE_NAME } from "@/features/cart/guest-cookie";
import { cookieJar } from "./helpers/cookie-jar";
import {
  makeProductRow,
  makeSession,
  makeUser,
  rejection,
  signInAs,
  validGuestToken,
} from "./helpers/factories";
import { getOrCreateGuestCart, addItem } from "@/features/cart/service";

const PHONE = "09121234567";

describe("OTP provider (development) against the real DB", () => {
  it("request + verify succeeds and consumes the challenge", async () => {
    const provider = getOtpProvider();
    expect(provider).toBeInstanceOf(DevelopmentOtpProvider);

    expect(await provider.requestOtp(PHONE)).toEqual({ success: true });
    // Only a hash is stored, never the plain code.
    const [challenge] = await prisma.otpChallenge.findMany();
    expect(challenge.codeHash).not.toContain(DEVELOPMENT_FIXED_OTP);

    expect(await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).toEqual({ success: true });
    const after = await prisma.otpChallenge.findFirstOrThrow();
    expect(after.consumedAt).not.toBeNull();
  });

  it("rejects an incorrect OTP and counts the attempt", async () => {
    const provider = getOtpProvider();
    await provider.requestOtp(PHONE);

    const result = await provider.verifyOtp(PHONE, "000000");
    expect(result.success).toBe(false);
    const challenge = await prisma.otpChallenge.findFirstOrThrow();
    expect(challenge.attempts).toBe(1);
    expect(challenge.consumedAt).toBeNull();
  });

  it("rejects reuse of an already-consumed OTP", async () => {
    const provider = getOtpProvider();
    await provider.requestOtp(PHONE);
    expect((await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).success).toBe(true);
    expect((await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).success).toBe(false);
  });

  it("locks the challenge after the maximum number of wrong attempts, even for the right code", async () => {
    const provider = getOtpProvider();
    await provider.requestOtp(PHONE);

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      expect((await provider.verifyOtp(PHONE, "111111")).success).toBe(false);
    }
    const locked = await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP);
    expect(locked.success).toBe(false);
    const challenge = await prisma.otpChallenge.findFirstOrThrow();
    expect(challenge.attempts).toBe(OTP_MAX_ATTEMPTS);
    expect(challenge.consumedAt).toBeNull();
  });

  it("rejects an expired challenge", async () => {
    const provider = getOtpProvider();
    await provider.requestOtp(PHONE);
    await prisma.otpChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    expect((await provider.verifyOtp(PHONE, DEVELOPMENT_FIXED_OTP)).success).toBe(false);
  });

  it("throttles repeated requests for the same phone", async () => {
    const provider = getOtpProvider();
    expect((await provider.requestOtp(PHONE)).success).toBe(true);
    expect((await provider.requestOtp(PHONE)).success).toBe(false);
    expect(await prisma.otpChallenge.count()).toBe(1);
  });

  it("a code for one phone cannot verify another phone", async () => {
    const provider = getOtpProvider();
    await provider.requestOtp(PHONE);
    expect((await provider.verifyOtp("09127654321", DEVELOPMENT_FIXED_OTP)).success).toBe(false);
  });
});

describe("verifyOtpAction end-to-end", () => {
  it("creates a CUSTOMER (never ADMIN) and sets a hashed, httpOnly session cookie", async () => {
    expect((await requestOtpAction(PHONE)).ok).toBe(true);
    const result = await verifyOtpAction(PHONE, DEVELOPMENT_FIXED_OTP);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.user.role).toBe(UserRole.CUSTOMER);

    const users = await prisma.user.findMany();
    expect(users).toHaveLength(1);
    expect(users[0].role).toBe(UserRole.CUSTOMER);
    expect(users[0].phoneNumber).toBe(PHONE);

    const token = cookieJar.get(SESSION_COOKIE_NAME)?.value;
    expect(token).toBeTruthy();
    expect(cookieJar.options(SESSION_COOKIE_NAME)).toMatchObject({ httpOnly: true, sameSite: "lax" });

    const session = await prisma.session.findFirstOrThrow();
    expect(session.userId).toBe(users[0].id);
    expect(session.hashedToken).toBe(sha256(token!));
    expect(session.hashedToken).not.toBe(token);

    // The cookie resolves to that user.
    const current = await getCurrentUser();
    expect(current?.id).toBe(users[0].id);
  });

  it("does not create a user or session for a wrong code", async () => {
    await requestOtpAction(PHONE);
    const result = await verifyOtpAction(PHONE, "654321");
    expect(result.ok).toBe(false);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.session.count()).toBe(0);
    expect(cookieJar.has(SESSION_COOKIE_NAME)).toBe(false);
  });

  it("rejects reuse of the OTP (no second session)", async () => {
    await requestOtpAction(PHONE);
    expect((await verifyOtpAction(PHONE, DEVELOPMENT_FIXED_OTP)).ok).toBe(true);
    cookieJar.clear();
    expect((await verifyOtpAction(PHONE, DEVELOPMENT_FIXED_OTP)).ok).toBe(false);
    expect(await prisma.session.count()).toBe(1);
  });

  it("rejects malformed input before touching the DB", async () => {
    expect((await verifyOtpAction("not-a-phone", DEVELOPMENT_FIXED_OTP)).ok).toBe(false);
    expect((await verifyOtpAction(PHONE, "12")).ok).toBe(false);
    expect((await requestOtpAction("123")).ok).toBe(false);
    expect(await prisma.otpChallenge.count()).toBe(0);
  });

  it("never changes the role of an existing ADMIN and never demotes/promotes on login", async () => {
    const admin = await prisma.user.create({ data: { phoneNumber: PHONE, role: UserRole.ADMIN } });
    await requestOtpAction(PHONE);
    const result = await verifyOtpAction(PHONE, DEVELOPMENT_FIXED_OTP);
    expect(result.ok && result.data.user.id).toBe(admin.id);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).role).toBe(UserRole.ADMIN);
  });

  it("a brand-new phone number equal to ROOT_ADMIN_PHONE still becomes a CUSTOMER", async () => {
    process.env.ROOT_ADMIN_PHONE = PHONE;
    await requestOtpAction(PHONE);
    const result = await verifyOtpAction(PHONE, DEVELOPMENT_FIXED_OTP);
    expect(result.ok && result.data.user.role).toBe(UserRole.CUSTOMER);
  });

  it("merges the guest cart into the new user's cart on login and clears the guest cookie", async () => {
    const product = await makeProductRow({ stockQuantity: 5 });
    const token = validGuestToken();
    cookieJar.set(GUEST_CART_COOKIE_NAME, token, {});
    const guest = await getOrCreateGuestCart(token);
    await addItem(guest.id, product.id, 2);

    await requestOtpAction(PHONE);
    const result = await verifyOtpAction(PHONE, DEVELOPMENT_FIXED_OTP);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const userCart = await prisma.cart.findUniqueOrThrow({
      where: { userId: result.data.user.id },
      include: { items: true },
    });
    expect(userCart.items).toHaveLength(1);
    expect(userCart.items[0].quantity).toBe(2);
    expect(await prisma.cart.count({ where: { guestTokenHash: { not: null } } })).toBe(0);
    expect(cookieJar.has(GUEST_CART_COOKIE_NAME)).toBe(false);
  });

  it("logoutAction revokes the session and removes the cookie", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    expect(await getCurrentUser()).not.toBeNull();

    expect((await logoutAction()).ok).toBe(true);
    expect(cookieJar.has(SESSION_COOKIE_NAME)).toBe(false);
    const session = await prisma.session.findFirstOrThrow();
    expect(session.revokedAt).not.toBeNull();
  });
});

describe("sessions", () => {
  it("returns the user for a valid session cookie", async () => {
    const user = await makeUser(UserRole.CUSTOMER, "Ali");
    await signInAs(user.id);
    const session = await getCurrentSession();
    expect(session?.user).toMatchObject({ id: user.id, role: UserRole.CUSTOMER, name: "Ali" });
  });

  it("rejects an expired session", async () => {
    const user = await makeUser();
    await signInAs(user.id, { expiresAt: new Date(Date.now() - 1000) });
    expect(await getCurrentSession()).toBeNull();
  });

  it("rejects a revoked session", async () => {
    const user = await makeUser();
    await signInAs(user.id, { revokedAt: new Date() });
    expect(await getCurrentSession()).toBeNull();
  });

  it("rejects a cookie holding the stored hash instead of the raw token", async () => {
    const user = await makeUser();
    const token = await makeSession(user.id);
    cookieJar.set(SESSION_COOKIE_NAME, sha256(token), {});
    expect(await getCurrentSession()).toBeNull();
  });

  it("rejects an unknown token and a missing cookie", async () => {
    cookieJar.set(SESSION_COOKIE_NAME, "x".repeat(43), {});
    expect(await getCurrentSession()).toBeNull();
    cookieJar.clear();
    expect(await getCurrentSession()).toBeNull();
  });

  it("deleting the user cascades to their sessions", async () => {
    const user = await makeUser();
    await makeSession(user.id);
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.session.count()).toBe(0);
  });
});

describe("permissions", () => {
  it("requireUser throws AuthenticationError without a session", async () => {
    expect(await rejection(requireUser())).toBeInstanceOf(AuthenticationError);
  });

  it("requireUser throws for expired and revoked sessions", async () => {
    const user = await makeUser();
    await signInAs(user.id, { expiresAt: new Date(Date.now() - 1000) });
    expect(await rejection(requireUser())).toBeInstanceOf(AuthenticationError);

    cookieJar.clear();
    await signInAs(user.id, { revokedAt: new Date() });
    expect(await rejection(requireUser())).toBeInstanceOf(AuthenticationError);
  });

  it("requireAdmin throws AuthenticationError without a session", async () => {
    expect(await rejection(requireAdmin())).toBeInstanceOf(AuthenticationError);
  });

  it("requireAdmin throws AuthorizationError for a CUSTOMER", async () => {
    const customer = await makeUser(UserRole.CUSTOMER);
    await signInAs(customer.id);
    expect(await rejection(requireAdmin())).toBeInstanceOf(AuthorizationError);
  });

  it("requireAdmin passes for an ADMIN", async () => {
    const admin = await makeUser(UserRole.ADMIN);
    await signInAs(admin.id);
    await expect(requireAdmin()).resolves.toMatchObject({ id: admin.id, role: UserRole.ADMIN });
  });

  it("role changes in the DB take effect on the next lookup (no stale role in the session)", async () => {
    const user = await makeUser(UserRole.ADMIN);
    await signInAs(user.id);
    await expect(requireAdmin()).resolves.toBeDefined();
    await prisma.user.update({ where: { id: user.id }, data: { role: UserRole.CUSTOMER } });
    expect(await rejection(requireAdmin())).toBeInstanceOf(AuthorizationError);
  });
});
