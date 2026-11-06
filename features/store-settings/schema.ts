import { z } from "zod";
import { fromPersianDigits } from "@/lib/format";
import { normalizeIranianPhone } from "@/lib/phone";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const mobileSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const normalized = normalizeIranianPhone(fromPersianDigits(value));
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: `شماره موبایل «${value}» معتبر نیست.` });
      return z.NEVER;
    }
    return normalized;
  });

/** Landline: digits only (with optional leading 0), 5-12 digits. */
const landlineSchema = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const digits = fromPersianDigits(value).replace(/[\s\-()]/g, "");
    if (!/^0?\d{5,11}$/.test(digits)) {
      ctx.addIssue({ code: "custom", message: `شماره ثابت «${value}» معتبر نیست.` });
      return z.NEVER;
    }
    return digits;
  });

const httpUrl = (label: string) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .trim()
      .max(500, `نشانی ${label} بیش از حد طولانی است.`)
      .refine((value) => {
        try {
          const url = new URL(value);
          return url.protocol === "https:" || url.protocol === "http:";
        } catch {
          return false;
        }
      }, `نشانی ${label} معتبر نیست.`)
      .nullable()
      .optional(),
  );

const optionalText = (max: number, label: string) =>
  z.preprocess(
    emptyToNull,
    z.string().trim().max(max, `${label} نباید بیش از ${max} حرف باشد.`).nullable().optional(),
  );

export const updateStoreSettingsSchema = z.object({
  storeName: z
    .string({ error: "نام فروشگاه را وارد کنید." })
    .trim()
    .min(1, "نام فروشگاه را وارد کنید.")
    .max(100, "نام فروشگاه نباید بیش از ۱۰۰ حرف باشد.")
    .optional(),
  logoKey: z.preprocess(
    emptyToNull,
    z.string().max(300).regex(/^[a-zA-Z0-9/_.-]+$/, "کلید لوگو نامعتبر است.").nullable().optional(),
  ),
  logoUrl: httpUrl("لوگو"),
  mobilePhones: z.array(mobileSchema).max(10, "حداکثر ۱۰ شماره موبایل مجاز است.").optional(),
  landlinePhones: z.array(landlineSchema).max(10, "حداکثر ۱۰ شماره ثابت مجاز است.").optional(),
  address: optionalText(500, "آدرس"),
  instagramUrl: httpUrl("اینستاگرام"),
  telegramUrl: httpUrl("تلگرام"),
  whatsappUrl: httpUrl("واتساپ"),
  additionalDescription: optionalText(2000, "توضیحات تکمیلی"),
});

export type UpdateStoreSettingsInput = z.input<typeof updateStoreSettingsSchema>;
export type UpdateStoreSettingsData = z.output<typeof updateStoreSettingsSchema>;
