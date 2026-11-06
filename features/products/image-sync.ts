import "server-only";

import { ServiceError } from "@/lib/errors";
import { MAX_PRODUCT_IMAGES } from "@/features/products/schema";
import {
  addProductImage,
  getProductById,
  removeProductImage,
  reorderProductImages,
  setPrimaryProductImage,
  updateProductImageAlt,
} from "@/features/products/service";

export interface DesiredProductImage {
  /** Present for images already attached to the product. */
  id?: string;
  storageKey: string;
  altText?: string | null;
}

const MSG = {
  notFound: "محصول یافت نشد.",
  unknownImage: "تصویر انتخاب‌شده متعلق به این محصول نیست.",
  duplicate: "یک تصویر نمی‌تواند چند بار اضافه شود.",
  tooMany: `حداکثر ${MAX_PRODUCT_IMAGES} تصویر برای هر محصول مجاز است.`,
} as const;

/**
 * Makes the product's images equal to `desired` (order = array order, first = primary):
 * removes dropped images, attaches new uploads (each re-verified in S3 by addProductImage),
 * then fixes order, primary flag and alt texts.
 */
export async function syncProductImages(
  productId: string,
  desired: DesiredProductImage[],
): Promise<void> {
  const product = await getProductById(productId);
  if (!product) throw new ServiceError("NOT_FOUND", MSG.notFound);
  if (desired.length > MAX_PRODUCT_IMAGES) throw new ServiceError("VALIDATION", MSG.tooMany);

  const current = new Map(product.images.map((image) => [image.id, image]));
  const keptIds = new Set<string>();
  const seenKeys = new Set<string>();
  for (const item of desired) {
    if (seenKeys.has(item.storageKey)) throw new ServiceError("VALIDATION", MSG.duplicate);
    seenKeys.add(item.storageKey);
    if (item.id) {
      if (!current.has(item.id)) throw new ServiceError("VALIDATION", MSG.unknownImage);
      keptIds.add(item.id);
    }
  }

  // 1) remove dropped images first so the per-product cap is not hit by new uploads
  for (const image of product.images) {
    if (!keptIds.has(image.id)) await removeProductImage(productId, image.id);
  }

  // 2) attach new uploads
  const orderedIds: string[] = [];
  for (const item of desired) {
    if (item.id) {
      orderedIds.push(item.id);
      continue;
    }
    const created = await addProductImage({
      productId,
      storageKey: item.storageKey,
      altText: item.altText ?? null,
    });
    orderedIds.push(created.id);
  }

  // 3) order / primary / alt text
  if (orderedIds.length > 0) {
    await reorderProductImages(productId, orderedIds);
    await setPrimaryProductImage(productId, orderedIds[0]!);
  }
  for (const item of desired) {
    if (!item.id) continue;
    const before = current.get(item.id)?.altText ?? null;
    const after = item.altText?.trim() ? item.altText.trim() : null;
    if (before !== after) await updateProductImageAlt(productId, item.id, after);
  }
}
