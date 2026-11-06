import "server-only";

import { prisma } from "@/lib/db";
import { generateNumericOtp, safeEqual, sha256 } from "@/lib/crypto";
import { getEnv, isDevelopmentOtpEnabled } from "@/lib/env";
import { OTP_LENGTH } from "@/features/auth/phone-schema";

export type OtpResult = { success: true } | { success: false; error: string };

export interface OtpProvider {
  requestOtp(phoneNumber: string): Promise<OtpResult>;
  verifyOtp(phoneNumber: string, code: string): Promise<OtpResult>;
}

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_THROTTLE_MS = 60 * 1000;
/** Fixed development-only code. Never accepted unless isDevelopmentOtpEnabled(). */
export const DEVELOPMENT_FIXED_OTP = "123456";

const MSG_THROTTLED = "درخواست مجدد کد فقط پس از ۶۰ ثانیه امکان‌پذیر است.";
const MSG_INVALID = "کد تأیید نادرست است.";
const MSG_EXPIRED = "کد تأیید منقضی شده یا درخواست نشده است. لطفاً کد جدید دریافت کنید.";
const MSG_TOO_MANY = "تعداد تلاش‌های ناموفق بیش از حد مجاز است. لطفاً کد جدید دریافت کنید.";
const MSG_SMS_UNAVAILABLE = "سرویس پیامک در دسترس نیست. لطفاً بعداً تلاش کنید.";
const MSG_SEND_FAILED = "ارسال پیامک ناموفق بود. لطفاً دوباره تلاش کنید.";
const MSG_GENERIC = "خطایی رخ داد. لطفاً دوباره تلاش کنید.";

/** SMS gateway abstraction. Plug a real implementation in getSmsSender(). */
export interface SmsSender {
  sendOtp(phoneNumber: string, code: string): Promise<boolean>;
}

/**
 * No SMS gateway is implemented yet, so this returns null and production OTP
 * requests fail closed. Wire a provider (Kavenegar, Ghasedak, ...) here.
 */
export function getSmsSender(): SmsSender | null {
  return null;
}

export function hashOtpCode(phoneNumber: string, code: string): string {
  const { SESSION_SECRET } = getEnv();
  return sha256(`${SESSION_SECRET}:${phoneNumber}:${code}`);
}

abstract class ChallengeOtpProvider implements OtpProvider {
  /** Whether the fixed development code is accepted by verifyOtp. */
  protected abstract readonly acceptsFixedCode: boolean;

  /** Produce the code to store; return failure to abort before any record is created. */
  protected abstract prepareCode(): { ok: true; code: string } | { ok: false; error: string };

  /** Deliver the code to the user. Must never expose it to the caller. */
  protected abstract deliver(phoneNumber: string, code: string): Promise<OtpResult>;

  async requestOtp(phoneNumber: string): Promise<OtpResult> {
    const prepared = this.prepareCode();
    if (!prepared.ok) return { success: false, error: prepared.error };

    try {
      const now = new Date();
      const created = await prisma.$transaction(async (tx) => {
        // Serialize concurrent requests for the same phone so throttling can't be raced.
        // $executeRaw: the function returns `void`, which $queryRaw cannot deserialize.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phoneNumber}))`;

        const recent = await tx.otpChallenge.findFirst({
          where: {
            phoneNumber,
            createdAt: { gt: new Date(now.getTime() - OTP_THROTTLE_MS) },
          },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        if (recent) return null;

        // Invalidate previous outstanding challenges.
        await tx.otpChallenge.updateMany({
          where: { phoneNumber, consumedAt: null },
          data: { consumedAt: now },
        });

        return tx.otpChallenge.create({
          data: {
            phoneNumber,
            codeHash: hashOtpCode(phoneNumber, prepared.code),
            expiresAt: new Date(now.getTime() + OTP_TTL_MS),
          },
          select: { id: true },
        });
      });

      if (!created) return { success: false, error: MSG_THROTTLED };

      const delivered = await this.deliver(phoneNumber, prepared.code);
      if (!delivered.success) {
        // Don't leave a usable challenge behind if delivery failed.
        await prisma.otpChallenge
          .updateMany({
            where: { id: created.id, consumedAt: null },
            data: { consumedAt: new Date() },
          })
          .catch(() => undefined);
      }
      return delivered;
    } catch (error) {
      console.error("[otp] requestOtp failed", error);
      return { success: false, error: MSG_GENERIC };
    }
  }

  async verifyOtp(phoneNumber: string, code: string): Promise<OtpResult> {
    try {
      const now = new Date();
      const challenge = await prisma.otpChallenge.findFirst({
        where: { phoneNumber, consumedAt: null, expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        select: { id: true, codeHash: true, attempts: true },
      });
      if (!challenge) return { success: false, error: MSG_EXPIRED };
      if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
        return { success: false, error: MSG_TOO_MANY };
      }

      // Count the attempt atomically *before* checking the code.
      const claimed = await prisma.otpChallenge.updateMany({
        where: {
          id: challenge.id,
          consumedAt: null,
          expiresAt: { gt: now },
          attempts: { lt: OTP_MAX_ATTEMPTS },
        },
        data: { attempts: { increment: 1 } },
      });
      if (claimed.count === 0) return { success: false, error: MSG_TOO_MANY };

      const hashMatches = safeEqual(challenge.codeHash, hashOtpCode(phoneNumber, code));
      const fixedMatches =
        this.acceptsFixedCode && safeEqual(code, DEVELOPMENT_FIXED_OTP);
      if (!hashMatches && !fixedMatches) {
        return { success: false, error: MSG_INVALID };
      }

      // Single-use: only one concurrent verifier may consume the challenge.
      const consumed = await prisma.otpChallenge.updateMany({
        where: { id: challenge.id, consumedAt: null },
        data: { consumedAt: new Date() },
      });
      if (consumed.count === 0) return { success: false, error: MSG_EXPIRED };

      return { success: true };
    } catch (error) {
      console.error("[otp] verifyOtp failed", error);
      return { success: false, error: MSG_GENERIC };
    }
  }
}

export class DevelopmentOtpProvider extends ChallengeOtpProvider {
  protected readonly acceptsFixedCode = true;

  constructor() {
    super();
    // Defense in depth: this class must never be usable in production.
    if (!isDevelopmentOtpEnabled()) {
      throw new Error("DevelopmentOtpProvider is only available when OTP_MODE=development and NODE_ENV!=production");
    }
  }

  protected prepareCode(): { ok: true; code: string } {
    return { ok: true, code: DEVELOPMENT_FIXED_OTP };
  }

  protected async deliver(): Promise<OtpResult> {
    // Nothing is sent in development; the fixed code is documented, never returned.
    return { success: true };
  }
}

export class ProductionOtpProvider extends ChallengeOtpProvider {
  protected readonly acceptsFixedCode = false;
  private readonly sender: SmsSender | null;

  constructor(sender: SmsSender | null = getSmsSender()) {
    super();
    this.sender = sender;
  }

  protected prepareCode(): { ok: true; code: string } | { ok: false; error: string } {
    // Fail closed: without an SMS gateway nothing is created or stored.
    if (!this.sender) return { ok: false, error: MSG_SMS_UNAVAILABLE };
    return { ok: true, code: generateNumericOtp(OTP_LENGTH) };
  }

  protected async deliver(phoneNumber: string, code: string): Promise<OtpResult> {
    if (!this.sender) return { success: false, error: MSG_SMS_UNAVAILABLE };
    try {
      const sent = await this.sender.sendOtp(phoneNumber, code);
      return sent ? { success: true } : { success: false, error: MSG_SEND_FAILED };
    } catch (error) {
      console.error("[otp] SMS delivery failed", error);
      return { success: false, error: MSG_SEND_FAILED };
    }
  }
}

export function getOtpProvider(): OtpProvider {
  return isDevelopmentOtpEnabled()
    ? new DevelopmentOtpProvider()
    : new ProductionOtpProvider();
}
