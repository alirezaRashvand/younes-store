import "server-only";

import { prisma } from "@/lib/db";
import { parseOrThrow, ServiceError } from "@/lib/errors";
import { assertAdmin } from "@/features/auth/permissions";
import type { SessionUser } from "@/features/auth/session";
import {
  StorageError,
  UPLOAD_PURPOSES,
  assertValidUploadedObject,
  buildPublicUrl,
  createPresignedUpload,
  deleteObject,
  generateObjectKey,
  isS3Configured,
  isValidStorageKey,
  validateUploadRequest,
  type PresignedUpload,
  type UploadPurpose,
} from "@/lib/storage/s3";
import {
  confirmUploadSchema,
  deleteMediaSchema,
  listMediaSchema,
  presignUploadSchema,
  type ConfirmUploadInput,
  type ListMediaInput,
  type PresignUploadInput,
} from "@/features/media/schema";

type Actor = Pick<SessionUser, "role">;

const MSG = {
  storageUnavailable: "ذخیره‌سازی فایل (S3) پیکربندی نشده است؛ بارگذاری تصویر فعلاً امکان‌پذیر نیست.",
  badKey: "کلید فایل نامعتبر است.",
  notFound: "فایل رسانه یافت نشد.",
  notVerified: "این تصویر تأیید نشده است. لطفاً دوباره آن را بارگذاری کنید.",
  notDeletable: "این فایل قابل حذف نیست.",
  inUse: "این فایل در حال استفاده است. ابتدا آن را از محصول، دسته‌بندی، لوگو یا توضیحات حذف کنید.",
  deleteFailed: "حذف فایل از فضای ذخیره‌سازی ناموفق بود. لطفاً دوباره تلاش کنید.",
} as const;

export type MediaUsageType = "product" | "category" | "logo" | "editor";

export interface MediaUsage {
  type: MediaUsageType;
  /** Product/category name, or the store name for the logo. */
  name: string;
  id?: string;
}

export interface MediaListItem {
  id: string;
  storageKey: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  purpose: string;
  createdAt: Date;
  verifiedAt: Date | null;
  usages: MediaUsage[];
}

export interface MediaPage {
  items: MediaListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

function isUploadPurpose(value: string): value is UploadPurpose {
  return (UPLOAD_PURPOSES as readonly string[]).includes(value);
}

/** A key is "owned" when it is well-formed and lives under its own purpose prefix. */
function keyMatchesPurpose(key: string, purpose: string): boolean {
  return isUploadPurpose(purpose) && isValidStorageKey(key) && key.startsWith(`${purpose}/`);
}

// ── Upload flow ──────────────────────────────────────────────────────────

/** Step 1: validate mime/size and mint a presigned PUT URL. Nothing is stored yet. */
export async function presignUpload(
  actor: Actor | null | undefined,
  input: PresignUploadInput,
): Promise<PresignedUpload> {
  assertAdmin(actor);
  const data = parseOrThrow(presignUploadSchema, input);
  if (!isS3Configured()) throw new ServiceError("UNAVAILABLE", MSG.storageUnavailable);

  const validation = validateUploadRequest({ contentType: data.contentType, size: data.size });
  if (!validation.ok) throw new ServiceError("VALIDATION", validation.error);

  try {
    const key = generateObjectKey({
      purpose: data.purpose,
      fileName: data.fileName,
      contentType: data.contentType,
    });
    return await createPresignedUpload({ key, contentType: data.contentType, maxSize: data.size });
  } catch (error) {
    if (error instanceof StorageError) throw new ServiceError("VALIDATION", error.message);
    throw error;
  }
}

/**
 * Step 3: after the client PUT to S3, verify the object really exists with an allowed
 * type and size, then record it as a verified MediaAsset.
 */
export async function confirmUpload(
  actor: Actor | null | undefined,
  input: ConfirmUploadInput,
): Promise<{ id: string; storageKey: string; url: string }> {
  assertAdmin(actor);
  const data = parseOrThrow(confirmUploadSchema, input);
  if (!isS3Configured()) throw new ServiceError("UNAVAILABLE", MSG.storageUnavailable);
  if (!keyMatchesPurpose(data.key, data.purpose)) throw new ServiceError("VALIDATION", MSG.badKey);

  let info: Awaited<ReturnType<typeof assertValidUploadedObject>>;
  let url: string;
  try {
    info = await assertValidUploadedObject(data.key);
    url = buildPublicUrl(data.key);
  } catch (error) {
    if (error instanceof StorageError) throw new ServiceError("VALIDATION", error.message);
    throw error;
  }

  const asset = await prisma.mediaAsset.upsert({
    where: { storageKey: data.key },
    create: {
      storageKey: data.key,
      url,
      mimeType: info.contentType ?? "application/octet-stream",
      sizeBytes: info.size,
      purpose: data.purpose,
      verifiedAt: new Date(),
    },
    // purpose is never rewritten: an asset keeps the purpose it was first registered with.
    update: {
      verifiedAt: new Date(),
      sizeBytes: info.size,
      mimeType: info.contentType ?? "application/octet-stream",
    },
    select: { id: true, storageKey: true, url: true },
  });
  return asset;
}

/**
 * Association step for single-image owners (category image, store logo): the client sends
 * only a storage key; the URL is looked up from a verified asset of the right purpose.
 *  - `undefined` -> leave unchanged (returns undefined)
 *  - `null`/""   -> clear
 *  - key         -> must be a verified MediaAsset with this purpose
 */
export async function resolveAssetAssociation(
  actor: Actor | null | undefined,
  key: string | null | undefined,
  purpose: UploadPurpose,
): Promise<{ imageKey: string | null; imageUrl: string | null } | undefined> {
  assertAdmin(actor);
  if (key === undefined) return undefined;
  if (key === null || key.trim() === "") return { imageKey: null, imageUrl: null };

  if (!keyMatchesPurpose(key, purpose)) throw new ServiceError("VALIDATION", MSG.badKey);
  const asset = await prisma.mediaAsset.findFirst({
    where: { storageKey: key, purpose, verifiedAt: { not: null } },
    select: { storageKey: true, url: true },
  });
  if (!asset) throw new ServiceError("VALIDATION", MSG.notVerified);
  return { imageKey: asset.storageKey, imageUrl: asset.url };
}

// ── Usage / references ───────────────────────────────────────────────────

/** Where each storage key is referenced from (product images, category/logo, editor content). */
export async function findMediaUsages(keys: string[]): Promise<Map<string, MediaUsage[]>> {
  const usages = new Map<string, MediaUsage[]>();
  if (keys.length === 0) return usages;

  const push = (key: string | null, usage: MediaUsage) => {
    if (!key) return;
    const list = usages.get(key);
    if (list) list.push(usage);
    else usages.set(key, [usage]);
  };

  const [productImages, categories, settings, editorRefs] = await Promise.all([
    prisma.productImage.findMany({
      where: { storageKey: { in: keys } },
      select: { storageKey: true, product: { select: { id: true, name: true } } },
    }),
    prisma.category.findMany({
      where: { imageKey: { in: keys } },
      select: { id: true, name: true, imageKey: true },
    }),
    prisma.storeSettings.findMany({
      where: { logoKey: { in: keys } },
      select: { logoKey: true, storeName: true },
    }),
    // Tiptap images store the public URL, which always contains the (URL-safe) storage key.
    prisma.$queryRaw<Array<{ key: string; id: string; name: string }>>`
      SELECT k.key AS key, p.id AS id, p.name AS name
      FROM unnest(${keys}::text[]) AS k(key)
      JOIN products p
        ON p.description IS NOT NULL
       AND position(k.key in p.description::text) > 0
    `,
  ]);

  for (const row of productImages) {
    push(row.storageKey, { type: "product", id: row.product.id, name: row.product.name });
  }
  for (const row of categories) {
    push(row.imageKey, { type: "category", id: row.id, name: row.name });
  }
  for (const row of settings) {
    push(row.logoKey, { type: "logo", name: row.storeName });
  }
  for (const row of editorRefs) {
    push(row.key, { type: "editor", id: row.id, name: row.name });
  }
  return usages;
}

// ── Library ──────────────────────────────────────────────────────────────

export async function listMediaAssets(
  actor: Actor | null | undefined,
  input: ListMediaInput = {},
): Promise<MediaPage> {
  assertAdmin(actor);
  const params = listMediaSchema.parse(input);
  const where = params.purpose ? { purpose: params.purpose } : {};

  const [total, rows] = await Promise.all([
    prisma.mediaAsset.count({ where }),
    prisma.mediaAsset.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  const usages = await findMediaUsages(rows.map((r) => r.storageKey));
  return {
    items: rows.map((row) => ({
      id: row.id,
      storageKey: row.storageKey,
      url: row.url,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      purpose: row.purpose,
      createdAt: row.createdAt,
      verifiedAt: row.verifiedAt,
      usages: usages.get(row.storageKey) ?? [],
    })),
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

export async function countMediaAssets(actor: Actor | null | undefined): Promise<number> {
  assertAdmin(actor);
  return prisma.mediaAsset.count();
}

/**
 * Deletes an unreferenced asset by its database id. The S3 key is never taken from the
 * caller: it is read from the record and must be well-formed and live under its own
 * purpose prefix before it is passed to S3.
 */
export async function deleteMediaAsset(
  actor: Actor | null | undefined,
  input: { id: string },
): Promise<void> {
  assertAdmin(actor);
  const { id } = parseOrThrow(deleteMediaSchema, input);

  const asset = await prisma.mediaAsset.findUnique({
    where: { id },
    select: { id: true, storageKey: true, purpose: true },
  });
  if (!asset) throw new ServiceError("NOT_FOUND", MSG.notFound);
  if (!keyMatchesPurpose(asset.storageKey, asset.purpose)) {
    throw new ServiceError("FORBIDDEN", MSG.notDeletable);
  }
  if (!isS3Configured()) throw new ServiceError("UNAVAILABLE", MSG.storageUnavailable);

  const usages = (await findMediaUsages([asset.storageKey])).get(asset.storageKey) ?? [];
  if (usages.length > 0) throw new ServiceError("CONFLICT", MSG.inUse);

  // Object first: if it fails the record stays and the delete can be retried;
  // S3 deletes are idempotent so a failed DB delete is also safely retryable.
  try {
    await deleteObject(asset.storageKey);
  } catch (error) {
    console.error("[media] failed to delete object", error);
    throw new ServiceError("INTERNAL", MSG.deleteFailed);
  }
  await prisma.mediaAsset.deleteMany({ where: { id: asset.id } });
}
