import { confirmUploadAction, presignUploadAction } from "@/features/media/actions";
import {
  MAX_UPLOAD_BYTES,
  isAllowedImageMime,
  type UploadPurpose,
} from "@/lib/storage/constants";

export type UploadResult =
  | { ok: true; data: { id: string; key: string; url: string } }
  | { ok: false; error: string };

export function validateImageFile(file: File): string | null {
  if (!isAllowedImageMime(file.type)) return "فقط تصاویر JPEG، PNG و WebP مجاز هستند.";
  if (file.size <= 0) return "فایل خالی است.";
  if (file.size > MAX_UPLOAD_BYTES) return "حجم فایل نباید بیشتر از ۵ مگابایت باشد.";
  return null;
}

function putToStorage(
  url: string,
  headers: Record<string, string>,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
      else resolve({ ok: false, error: "ارسال فایل به فضای ذخیره‌سازی ناموفق بود." });
    };
    xhr.onerror = () =>
      resolve({
        ok: false,
        error: "اتصال به فضای ذخیره‌سازی برقرار نشد. تنظیمات CORS باکت را بررسی کنید.",
      });
    xhr.onabort = () => resolve({ ok: false, error: "بارگذاری لغو شد." });
    xhr.send(file);
  });
}

/**
 * Full presigned upload: (1) server action validates and presigns, (2) browser PUTs the
 * file straight to S3, (3) server action verifies the object exists and registers it.
 */
export async function uploadImage(
  file: File,
  purpose: UploadPurpose,
  onProgress?: (percent: number) => void,
): Promise<UploadResult> {
  const invalid = validateImageFile(file);
  if (invalid) return { ok: false, error: invalid };

  const presigned = await presignUploadAction({
    purpose,
    fileName: file.name,
    contentType: file.type,
    size: file.size,
  });
  if (!presigned.ok) return { ok: false, error: presigned.error };

  const put = await putToStorage(
    presigned.data.uploadUrl,
    presigned.data.headers,
    file,
    onProgress,
  );
  if (!put.ok) return put;

  const confirmed = await confirmUploadAction({ purpose, key: presigned.data.key });
  if (!confirmed.ok) return { ok: false, error: confirmed.error };

  return {
    ok: true,
    data: { id: confirmed.data.id, key: confirmed.data.storageKey, url: confirmed.data.url },
  };
}
