import "server-only";

import { randomBytes } from "node:crypto";
import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getEnv, isS3Configured } from "@/lib/env";
import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  MIME_EXTENSION,
  UPLOAD_PURPOSES,
  isAllowedImageMime,
  type UploadPurpose,
} from "@/lib/storage/constants";

export { isS3Configured } from "@/lib/env";
export * from "@/lib/storage/constants";

export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageError";
  }
}

const PRESIGN_EXPIRES_SECONDS = 5 * 60;

let client: S3Client | null = null;

function getClient(): S3Client {
  if (!isS3Configured()) {
    throw new StorageError("ذخیره‌سازی فایل پیکربندی نشده است.");
  }
  if (client) return client;
  const env = getEnv();
  client = new S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
  return client;
}

// ── Keys ─────────────────────────────────────────────────────────────────

/** `purpose/<id>-<name>.<ext>` where id is 24 hex chars, name is [a-z0-9-]. */
const KEY_REGEX = /^(product|category|logo|editor)\/[a-f0-9]{24}-[a-z0-9-]{1,60}\.(jpg|png|webp)$/;

export function isValidStorageKey(key: string): boolean {
  return key.length <= 200 && !key.includes("..") && KEY_REGEX.test(key);
}

export function sanitizeFileNameForKey(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./\\]*$/, "");
  const cleaned = withoutExt
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return cleaned || "file";
}

export function generateObjectKey(args: {
  purpose: UploadPurpose;
  fileName: string;
  contentType: string;
}): string {
  if (!(UPLOAD_PURPOSES as readonly string[]).includes(args.purpose)) {
    throw new StorageError("نوع بارگذاری نامعتبر است.");
  }
  if (!isAllowedImageMime(args.contentType)) {
    throw new StorageError("فقط تصاویر JPEG، PNG و WebP مجاز هستند.");
  }
  const id = randomBytes(12).toString("hex");
  const name = sanitizeFileNameForKey(args.fileName);
  return `${args.purpose}/${id}-${name}.${MIME_EXTENSION[args.contentType]}`;
}

// ── Validation ───────────────────────────────────────────────────────────

export function validateUploadRequest(args: {
  contentType: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (!isAllowedImageMime(args.contentType)) {
    return { ok: false, error: "فقط تصاویر JPEG، PNG و WebP مجاز هستند." };
  }
  if (!Number.isFinite(args.size) || !Number.isInteger(args.size) || args.size <= 0) {
    return { ok: false, error: "حجم فایل نامعتبر است." };
  }
  if (args.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "حجم فایل نباید بیشتر از ۵ مگابایت باشد." };
  }
  return { ok: true };
}

// ── Operations ───────────────────────────────────────────────────────────

export interface PresignedUpload {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresInSeconds: number;
}

/**
 * Presigned PUT URL. Content-Type and Content-Length are part of the signature,
 * so the client must send exactly the declared type/size. `maxSize` is the
 * client's declared file size in bytes (validated <= 5MB); a presigned PUT cannot
 * express a range, so binding the exact size is how the cap is enforced.
 * Always call assertValidUploadedObject(key) after upload as a second check.
 */
export async function createPresignedUpload(args: {
  key: string;
  contentType: string;
  maxSize: number;
}): Promise<PresignedUpload> {
  const validation = validateUploadRequest({ contentType: args.contentType, size: args.maxSize });
  if (!validation.ok) throw new StorageError(validation.error);
  if (!isValidStorageKey(args.key)) throw new StorageError("کلید فایل نامعتبر است.");

  const s3 = getClient();
  const command = new PutObjectCommand({
    Bucket: getEnv().S3_BUCKET,
    Key: args.key,
    ContentType: args.contentType,
    ContentLength: args.maxSize,
    CacheControl: "public, max-age=31536000, immutable",
  });

  const uploadUrl = await getSignedUrl(s3, command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
    signableHeaders: new Set(["content-type", "content-length"]),
  });

  return {
    key: args.key,
    uploadUrl,
    publicUrl: buildPublicUrl(args.key),
    method: "PUT",
    headers: { "Content-Type": args.contentType },
    expiresInSeconds: PRESIGN_EXPIRES_SECONDS,
  };
}

export type ObjectInfo =
  | { exists: true; size: number; contentType: string | null }
  | { exists: false };

/** HEAD the object. Callers should also check size/contentType via assertValidUploadedObject(). */
export async function verifyObjectExists(key: string): Promise<ObjectInfo> {
  if (!isValidStorageKey(key)) return { exists: false };
  try {
    const res = await getClient().send(
      new HeadObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: key }),
    );
    return {
      exists: true,
      size: res.ContentLength ?? 0,
      contentType: res.ContentType ?? null,
    };
  } catch (error) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err.name === "NotFound" || err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) {
      return { exists: false };
    }
    throw error;
  }
}

/** Verifies the uploaded object exists, is an allowed image type and within the size limit. */
export async function assertValidUploadedObject(key: string): Promise<ObjectInfo & { exists: true }> {
  const info = await verifyObjectExists(key);
  if (!info.exists) throw new StorageError("فایل بارگذاری‌شده یافت نشد.");
  if (info.size <= 0 || info.size > MAX_UPLOAD_BYTES) {
    throw new StorageError("حجم فایل بارگذاری‌شده مجاز نیست.");
  }
  if (!info.contentType || !(ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(info.contentType)) {
    throw new StorageError("نوع فایل بارگذاری‌شده مجاز نیست.");
  }
  return info;
}

export async function deleteObject(key: string): Promise<void> {
  if (!isValidStorageKey(key)) return;
  await getClient().send(new DeleteObjectCommand({ Bucket: getEnv().S3_BUCKET, Key: key }));
}

export function buildPublicUrl(key: string): string {
  const env = getEnv();
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");

  if (env.S3_PUBLIC_BASE_URL) {
    return `${env.S3_PUBLIC_BASE_URL.replace(/\/+$/, "")}/${encodedKey}`;
  }
  if (!env.S3_ENDPOINT || !env.S3_BUCKET) {
    throw new StorageError("ذخیره‌سازی فایل پیکربندی نشده است.");
  }
  return `${env.S3_ENDPOINT.replace(/\/+$/, "")}/${env.S3_BUCKET}/${encodedKey}`;
}
