import { z } from "zod";
import { UPLOAD_PURPOSES } from "@/lib/storage/constants";

const idSchema = z.string().min(1, "شناسه نامعتبر است.").max(64, "شناسه نامعتبر است.");

export const uploadPurposeSchema = z.enum(UPLOAD_PURPOSES, {
  error: "نوع بارگذاری نامعتبر است.",
});

export const presignUploadSchema = z.object({
  purpose: uploadPurposeSchema,
  fileName: z.string().trim().min(1, "نام فایل نامعتبر است.").max(255, "نام فایل نامعتبر است."),
  contentType: z.string().trim().min(1, "نوع فایل نامعتبر است.").max(100, "نوع فایل نامعتبر است."),
  size: z.number({ error: "حجم فایل نامعتبر است." }).int("حجم فایل نامعتبر است."),
});

export const confirmUploadSchema = z.object({
  purpose: uploadPurposeSchema,
  key: z.string().min(1, "کلید فایل نامعتبر است.").max(200, "کلید فایل نامعتبر است."),
});

export const deleteMediaSchema = z.object({ id: idSchema });

export const MEDIA_PAGE_SIZE = 24;

/** Resilient to bad query-string values. */
export const listMediaSchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(MEDIA_PAGE_SIZE),
  purpose: uploadPurposeSchema.optional().catch(undefined),
});

export type PresignUploadInput = z.input<typeof presignUploadSchema>;
export type ConfirmUploadInput = z.input<typeof confirmUploadSchema>;
export type ListMediaInput = {
  page?: number | string;
  pageSize?: number | string;
  purpose?: string;
};
