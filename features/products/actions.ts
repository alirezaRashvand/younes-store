"use server";

import { actionOk, type ActionResult } from "@/lib/action-result";
import { parseOrThrow, ServiceError } from "@/lib/errors";
import { isEmptyTiptapDoc } from "@/lib/rich-text";
import { requireAdmin } from "@/features/auth/permissions";
import { toAdminActionError } from "@/features/auth/action-errors";
import { revalidateAfterAdminWrite } from "@/features/admin/revalidate";
import { syncProductImages } from "@/features/products/image-sync";
import {
  archiveProduct,
  createProduct,
  updateProduct,
} from "@/features/products/service";
import { productFormSchema } from "@/features/products/schema";
import type { ProductFormPayload, ProductSaveData } from "@/features/products/form-types";

const IMAGES_WARNING =
  "محصول ذخیره شد، اما ذخیره تصاویر با مشکل روبه‌رو شد. تصاویر را دوباره بررسی کنید.";

/** A Tiptap document that only holds an empty paragraph is "no description". */
function normalizeDescription(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  return isEmptyTiptapDoc(value) ? null : value;
}

function parsePayload(payload: ProductFormPayload) {
  return parseOrThrow(productFormSchema, {
    ...payload,
    description: normalizeDescription(payload.description),
  });
}

export async function createProductAction(
  payload: ProductFormPayload,
): Promise<ActionResult<ProductSaveData>> {
  try {
    await requireAdmin();
    const { images, ...data } = parsePayload(payload);

    const product = await createProduct(data);

    let warning: string | undefined;
    if (images.length > 0) {
      try {
        await syncProductImages(product.id, images);
      } catch (error) {
        console.error("[products] image sync failed after create", error);
        warning = error instanceof ServiceError ? error.message : IMAGES_WARNING;
      }
    }

    revalidateAfterAdminWrite();
    return actionOk({ id: product.id, warning });
  } catch (error) {
    return toAdminActionError(error);
  }
}

export async function updateProductAction(
  id: string,
  payload: ProductFormPayload,
): Promise<ActionResult<ProductSaveData>> {
  try {
    await requireAdmin();
    const { images, slug, ...data } = parsePayload(payload);

    // Product fields first; they are validated and saved atomically by the service.
    await updateProduct(id, { ...data, slug: slug ?? undefined });

    let warning: string | undefined;
    try {
      await syncProductImages(id, images);
    } catch (error) {
      console.error("[products] image sync failed after update", error);
      warning = error instanceof ServiceError ? error.message : IMAGES_WARNING;
    }

    revalidateAfterAdminWrite();
    return actionOk({ id, warning });
  } catch (error) {
    return toAdminActionError(error);
  }
}

/** Soft-delete: the product stays in the database with status ARCHIVED. */
export async function archiveProductAction(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await archiveProduct(id);
    revalidateAfterAdminWrite();
    return actionOk(null);
  } catch (error) {
    return toAdminActionError(error);
  }
}

/** Brings an archived product back as a draft (never straight to published). */
export async function restoreProductAction(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await updateProduct(id, { status: "DRAFT" });
    revalidateAfterAdminWrite();
    return actionOk(null);
  } catch (error) {
    return toAdminActionError(error);
  }
}
