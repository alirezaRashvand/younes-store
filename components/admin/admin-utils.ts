import { toPersianDigits } from "@/lib/format";

export const UPLOADS_DISABLED_MESSAGE =
  "بارگذاری تصویر نیازمند پیکربندی ذخیره‌سازی S3 است. متغیرهای S3_ENDPOINT، S3_BUCKET، S3_ACCESS_KEY_ID و S3_SECRET_ACCESS_KEY را در فایل env تنظیم کنید و سرور را دوباره اجرا کنید.";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${toPersianDigits(bytes)} بایت`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${toPersianDigits(Math.round(kb))} کیلوبایت`;
  const mb = kb / 1024;
  return `${toPersianDigits(mb.toFixed(1)).replace(".", "٫")} مگابایت`;
}

const dateFormatter = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium" });
const dateTimeFormatter = new Intl.DateTimeFormat("fa-IR", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDate(value: Date | string | number): string {
  return dateFormatter.format(new Date(value));
}

export function formatDateTime(value: Date | string | number): string {
  return dateTimeFormatter.format(new Date(value));
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat("fa-IR").format(value);
}

export const STATUS_LABELS = {
  DRAFT: "پیش‌نویس",
  PUBLISHED: "منتشرشده",
  ARCHIVED: "بایگانی‌شده",
} as const;

export const STATUS_BADGE_VARIANT = {
  DRAFT: "warning",
  PUBLISHED: "success",
  ARCHIVED: "muted",
} as const;

export const PURPOSE_LABELS: Record<string, string> = {
  product: "تصویر محصول",
  category: "تصویر دسته‌بندی",
  logo: "لوگو",
  editor: "تصویر توضیحات",
};

export const STOCK_FILTER_LABELS = {
  in_stock: "موجود",
  out_of_stock: "ناموجود",
  low_stock: "کم‌موجودی",
} as const;
