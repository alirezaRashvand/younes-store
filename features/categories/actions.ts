"use server";

import { actionOk, type ActionResult } from "@/lib/action-result";
import { ServiceError } from "@/lib/errors";
import { requireAdmin } from "@/features/auth/permissions";
import { toAdminActionError } from "@/features/auth/action-errors";
import { revalidateAfterAdminWrite } from "@/features/admin/revalidate";
import { resolveAssetAssociation } from "@/features/media/service";
import {
  createCategory,
  deleteCategory,
  getCategoryById,
  moveCategory,
  reorderCategories,
  updateCategory,
} from "@/features/categories/service";
import type { DeleteCategoryStrategy } from "@/features/categories/schema";

export interface CategoryFormPayload {
  name: string;
  slug?: string | null;
  description?: string | null;
  /** undefined = unchanged, null = remove image, string = a verified "category/" upload. */
  imageKey?: string | null;
  /** null = root. On update, a changed value triggers a (cycle-checked) move. */
  parentId?: string | null;
}

export async function createCategoryAction(
  payload: CategoryFormPayload,
): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin();
    // The image URL is derived from the verified asset, never taken from the client.
    const image = await resolveAssetAssociation(admin, payload.imageKey, "category");

    const category = await createCategory({
      name: payload.name,
      slug: payload.slug,
      description: payload.description,
      parentId: payload.parentId,
      ...(image ?? {}),
    });
    revalidateAfterAdminWrite();
    return actionOk({ id: category.id });
  } catch (error) {
    return toAdminActionError(error);
  }
}

export async function updateCategoryAction(
  id: string,
  payload: CategoryFormPayload,
): Promise<ActionResult<{ id: string }>> {
  try {
    const admin = await requireAdmin();
    const existing = await getCategoryById(id);
    if (!existing) throw new ServiceError("NOT_FOUND", "دسته‌بندی یافت نشد.");

    const image = await resolveAssetAssociation(admin, payload.imageKey, "category");

    // Move first: it validates self-parenting / cycles before anything else is written.
    if (payload.parentId !== undefined && (payload.parentId || null) !== existing.parentId) {
      await moveCategory({ id, newParentId: payload.parentId || null });
    }

    await updateCategory(id, {
      name: payload.name,
      // An empty slug on edit means "keep the current one".
      slug: payload.slug?.trim() ? payload.slug : undefined,
      description: payload.description ?? null,
      ...(image ?? {}),
    });
    revalidateAfterAdminWrite();
    return actionOk({ id });
  } catch (error) {
    return toAdminActionError(error);
  }
}

export async function moveCategoryAction(input: {
  id: string;
  newParentId: string | null;
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    await moveCategory({ id: input.id, newParentId: input.newParentId });
    revalidateAfterAdminWrite();
    return actionOk(null);
  } catch (error) {
    return toAdminActionError(error);
  }
}

export async function reorderCategoriesAction(input: {
  parentId: string | null;
  orderedIds: string[];
}): Promise<ActionResult> {
  try {
    await requireAdmin();
    await reorderCategories({ parentId: input.parentId, orderedIds: input.orderedIds });
    revalidateAfterAdminWrite();
    return actionOk(null);
  } catch (error) {
    return toAdminActionError(error);
  }
}

export async function deleteCategoryAction(
  id: string,
  strategy: DeleteCategoryStrategy,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await deleteCategory(id, strategy);
    revalidateAfterAdminWrite();
    return actionOk(null);
  } catch (error) {
    return toAdminActionError(error);
  }
}
