import { z } from "zod";
import { fromPersianDigits } from "@/lib/format";
import { normalizeIranianPhone } from "@/lib/phone";

export const OTP_LENGTH = 6;

/** Accepts Persian/Arabic digits, +98, 98, 0 prefix. Outputs canonical 09XXXXXXXXX. */
export const phoneSchema = z
  .string({ error: "شماره موبایل را وارد کنید." })
  .trim()
  .min(1, "شماره موبایل را وارد کنید.")
  .max(20, "شماره موبایل معتبر نیست.")
  .transform((value, ctx) => {
    const normalized = normalizeIranianPhone(fromPersianDigits(value));
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "شماره موبایل معتبر نیست. مثال: ۰۹۱۲۳۴۵۶۷۸۹",
      });
      return z.NEVER;
    }
    return normalized;
  });

export const otpCodeSchema = z
  .string({ error: "کد تأیید را وارد کنید." })
  .trim()
  .transform((value) => fromPersianDigits(value))
  .refine((value) => new RegExp(`^\\d{${OTP_LENGTH}}$`).test(value), {
    message: `کد تأیید باید ${OTP_LENGTH} رقم باشد.`,
  });

export const requestOtpSchema = z.object({
  phone: phoneSchema,
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});

export const updateProfileSchema = z.object({
  name: z
    .string({ error: "نام را وارد کنید." })
    .trim()
    .min(2, "نام باید حداقل ۲ حرف باشد.")
    .max(80, "نام نباید بیش از ۸۰ حرف باشد."),
});

export type RequestOtpInput = z.input<typeof requestOtpSchema>;
export type VerifyOtpInput = z.input<typeof verifyOtpSchema>;
