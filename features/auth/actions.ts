"use server";

import { prisma } from "@/lib/db";
import {
  actionError,
  actionOk,
  toActionError,
  type ActionResult,
} from "@/lib/action-result";
import { UserRole } from "@/generated/prisma/client";
import { getOtpProvider } from "@/features/auth/otp-provider";
import {
  requestOtpSchema,
  updateProfileSchema,
  verifyOtpSchema,
} from "@/features/auth/phone-schema";
import { createSession, logout } from "@/features/auth/session";
import { requireUser, AuthenticationError } from "@/features/auth/permissions";
import {
  clearGuestCartToken,
  getGuestCartToken,
} from "@/features/cart/guest-cookie";
import { mergeGuestCartIntoUserCart } from "@/features/cart/service";

const INVALID_INPUT = "اطلاعات واردشده معتبر نیست.";

export async function requestOtpAction(phone: string): Promise<ActionResult> {
  const parsed = requestOtpSchema.safeParse({ phone });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? INVALID_INPUT);
  }

  try {
    const result = await getOtpProvider().requestOtp(parsed.data.phone);
    if (!result.success) return actionError(result.error);
    // The OTP is never included in the response.
    return actionOk(null);
  } catch (error) {
    return toActionError(error);
  }
}

export interface VerifyOtpData {
  user: { id: string; name: string | null; role: UserRole };
}

export async function verifyOtpAction(
  phone: string,
  code: string,
): Promise<ActionResult<VerifyOtpData>> {
  const parsed = verifyOtpSchema.safeParse({ phone, code });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? INVALID_INPUT);
  }

  try {
    const verification = await getOtpProvider().verifyOtp(
      parsed.data.phone,
      parsed.data.code,
    );
    if (!verification.success) return actionError(verification.error);

    // Users created through OTP are always CUSTOMER. Existing users keep their
    // role untouched (`update: {}`), so this path can never grant ADMIN.
    const user = await prisma.user.upsert({
      where: { phoneNumber: parsed.data.phone },
      create: { phoneNumber: parsed.data.phone, role: UserRole.CUSTOMER },
      update: {},
      select: { id: true, name: true, role: true },
    });

    await createSession(user.id);

    // Merge guest cart. Failure must not block login.
    try {
      const guestToken = await getGuestCartToken();
      if (guestToken) {
        await mergeGuestCartIntoUserCart(guestToken, user.id);
        await clearGuestCartToken();
      }
    } catch (error) {
      console.error("[auth] guest cart merge failed", error);
    }

    return actionOk({ user });
  } catch (error) {
    return toActionError(error);
  }
}

export async function logoutAction(): Promise<ActionResult> {
  try {
    await logout();
    return actionOk(null);
  } catch (error) {
    return toActionError(error);
  }
}

/** Customers may update only their own display name (never role/phone). */
export async function updateProfileAction(
  name: string,
): Promise<ActionResult<{ name: string }>> {
  const parsed = updateProfileSchema.safeParse({ name });
  if (!parsed.success) {
    return actionError(parsed.error.issues[0]?.message ?? INVALID_INPUT, {
      name: parsed.error.issues.map((i) => i.message),
    });
  }

  try {
    const current = await requireUser();
    if (current.role !== UserRole.CUSTOMER) {
      return actionError("این بخش فقط برای مشتریان در دسترس است.");
    }
    // Only `name` is written: role and phoneNumber can never change here.
    const updated = await prisma.user.update({
      where: { id: current.id },
      data: { name: parsed.data.name },
      select: { name: true },
    });
    return actionOk({ name: updated.name ?? parsed.data.name });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return actionError(error.message);
    }
    return toActionError(error);
  }
}
