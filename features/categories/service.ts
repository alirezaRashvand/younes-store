import "server-only";

import { prisma } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { isPrismaErrorCode, isUniqueViolation, parseOrThrow, ServiceError } from "@/lib/errors";
import { ensureUniqueSlug } from "@/lib/slug";
import {
  buildCategoryPath,
  buildCategoryTree,
  buildChildrenIndex,
  collectDescendantIds,
  wouldCreateCycle,
  type CategoryNode,
  type FlatCategory,
} from "@/features/categories/tree";
import {
  createCategorySchema,
  deleteCategoryStrategySchema,
  idSchema,
  moveCategorySchema,
  reorderCategoriesSchema,
  updateCategorySchema,
  type CreateCategoryInput,
  type DeleteCategoryStrategy,
  type MoveCategoryInput,
  type ReorderCategoriesInput,
  type UpdateCategoryInput,
} from "@/features/categories/schema";

export type { CategoryNode, FlatCategory } from "@/features/categories/tree";

const MSG = {
  notFound: "دسته‌بندی یافت نشد.",
  parentNotFound: "دسته‌بندی والد یافت نشد.",
  slugTaken: "این نامک قبلاً استفاده شده است.",
  selfParent: "یک دسته‌بندی نمی‌تواند والد خودش باشد.",
  cycle: "دسته‌بندی را نمی‌توان زیر زیرمجموعه‌های خودش منتقل کرد.",
  hasChildren: "این دسته‌بندی زیرمجموعه دارد. ابتدا زیرمجموعه‌ها را منتقل یا حذف کنید.",
  concurrent: "هم‌زمان تغییری ایجاد شد. لطفاً دوباره تلاش کنید.",
  reorderMismatch: "فهرست دسته‌بندی‌ها با دسته‌بندی‌های موجود هم‌خوانی ندارد.",
} as const;

const categorySelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  imageKey: true,
  imageUrl: true,
  parentId: true,
  sortOrder: true,
} satisfies Prisma.CategorySelect;

type Tx = Prisma.TransactionClient;
const SERIALIZABLE = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable } as const;

async function fetchAllFlat(db: Pick<Tx, "category"> = prisma): Promise<FlatCategory[]> {
  return db.category.findMany({
    select: categorySelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });
}

// ── Reads ────────────────────────────────────────────────────────────────

/** One query, tree built in memory. */
export async function listCategoryTree(): Promise<CategoryNode[]> {
  return buildCategoryTree(await fetchAllFlat());
}

export async function listCategoriesFlat(): Promise<FlatCategory[]> {
  return fetchAllFlat();
}

export async function getCategoryById(id: string): Promise<FlatCategory | null> {
  return prisma.category.findUnique({
    where: { id: idSchema.parse(id) },
    select: categorySelect,
  });
}

export async function getCategoryBySlug(slug: string): Promise<FlatCategory | null> {
  if (!slug) return null;
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    // keep raw slug
  }
  return prisma.category.findUnique({
    where: { slug: decoded.toLowerCase() },
    select: categorySelect,
  });
}

/** Ancestors from root down to (and including) the category. */
export async function getCategoryPath(categoryId: string): Promise<FlatCategory[]> {
  return buildCategoryPath(await fetchAllFlat(), categoryId);
}

/** BFS over the in-memory map; descendants only (excludes categoryId). */
export async function getDescendantIds(categoryId: string): Promise<string[]> {
  const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
  return collectDescendantIds(buildChildrenIndex(all), categoryId);
}

// ── Writes ───────────────────────────────────────────────────────────────

export async function createCategory(input: CreateCategoryInput): Promise<FlatCategory> {
  const data = parseOrThrow(createCategorySchema, input);

  try {
    return await prisma.$transaction(async (tx) => {
      if (data.parentId) {
        const parent = await tx.category.findUnique({
          where: { id: data.parentId },
          select: { id: true },
        });
        if (!parent) throw new ServiceError("NOT_FOUND", MSG.parentNotFound);
      }

      let slug = data.slug ?? null;
      if (slug) {
        const taken = await tx.category.findUnique({ where: { slug }, select: { id: true } });
        if (taken) throw new ServiceError("CONFLICT", MSG.slugTaken);
      } else {
        slug = await ensureUniqueSlug(
          data.name,
          async (candidate) =>
            (await tx.category.findUnique({ where: { slug: candidate }, select: { id: true } })) !== null,
        );
      }

      let sortOrder = data.sortOrder;
      if (sortOrder === undefined) {
        const last = await tx.category.aggregate({
          where: { parentId: data.parentId ?? null },
          _max: { sortOrder: true },
        });
        sortOrder = (last._max.sortOrder ?? -1) + 1;
      }

      return tx.category.create({
        data: {
          name: data.name,
          slug,
          description: data.description ?? null,
          imageKey: data.imageKey ?? null,
          imageUrl: data.imageUrl ?? null,
          parentId: data.parentId ?? null,
          sortOrder,
        },
        select: categorySelect,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError("CONFLICT", MSG.slugTaken);
    throw error;
  }
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<FlatCategory> {
  const categoryId = parseOrThrow(idSchema, id);
  const data = parseOrThrow(updateCategorySchema, input);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.category.findUnique({
        where: { id: categoryId },
        select: { id: true, slug: true },
      });
      if (!existing) throw new ServiceError("NOT_FOUND", MSG.notFound);

      if (data.slug && data.slug !== existing.slug) {
        const taken = await tx.category.findUnique({
          where: { slug: data.slug },
          select: { id: true },
        });
        if (taken) throw new ServiceError("CONFLICT", MSG.slugTaken);
      }

      return tx.category.update({
        where: { id: categoryId },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.slug !== undefined && { slug: data.slug }),
          ...(data.description !== undefined && { description: data.description }),
          ...(data.imageKey !== undefined && { imageKey: data.imageKey }),
          ...(data.imageUrl !== undefined && { imageUrl: data.imageUrl }),
          ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
        },
        select: categorySelect,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError("CONFLICT", MSG.slugTaken);
    throw error;
  }
}

/**
 * Moves a category under a new parent (or to the root with null).
 * Rejects self-parenting and moving under one of its own descendants.
 * Runs SERIALIZABLE so two concurrent moves can't jointly create a cycle.
 */
export async function moveCategory(input: MoveCategoryInput): Promise<FlatCategory> {
  const { id, newParentId, sortOrder } = parseOrThrow(moveCategorySchema, input);

  if (newParentId === id) throw new ServiceError("VALIDATION", MSG.selfParent);

  try {
    return await prisma.$transaction(async (tx) => {
      const all = await tx.category.findMany({ select: { id: true, parentId: true } });
      if (!all.some((c) => c.id === id)) throw new ServiceError("NOT_FOUND", MSG.notFound);
      if (newParentId !== null && !all.some((c) => c.id === newParentId)) {
        throw new ServiceError("NOT_FOUND", MSG.parentNotFound);
      }
      if (wouldCreateCycle(all, id, newParentId)) {
        throw new ServiceError("VALIDATION", MSG.cycle);
      }

      let nextSort = sortOrder;
      if (nextSort === undefined) {
        const last = await tx.category.aggregate({
          where: { parentId: newParentId, NOT: { id } },
          _max: { sortOrder: true },
        });
        nextSort = (last._max.sortOrder ?? -1) + 1;
      }

      return tx.category.update({
        where: { id },
        data: { parentId: newParentId, sortOrder: nextSort },
        select: categorySelect,
      });
    }, SERIALIZABLE);
  } catch (error) {
    if (isPrismaErrorCode(error, "P2034")) throw new ServiceError("CONFLICT", MSG.concurrent);
    throw error;
  }
}

/**
 * Deletes a category.
 *  - "block" (default): refuses when the category has children.
 *  - "promote-children": children move up to the deleted category's parent.
 * Products are never deleted: only the ProductCategory junction rows cascade.
 */
export async function deleteCategory(
  id: string,
  strategy: DeleteCategoryStrategy = "block",
): Promise<void> {
  const categoryId = parseOrThrow(idSchema, id);
  const chosen = parseOrThrow(deleteCategoryStrategySchema, strategy);

  try {
    await prisma.$transaction(async (tx) => {
      const category = await tx.category.findUnique({
        where: { id: categoryId },
        select: { id: true, parentId: true },
      });
      if (!category) throw new ServiceError("NOT_FOUND", MSG.notFound);

      const childCount = await tx.category.count({ where: { parentId: categoryId } });
      if (childCount > 0) {
        if (chosen === "block") throw new ServiceError("CONFLICT", MSG.hasChildren);
        await tx.category.updateMany({
          where: { parentId: categoryId },
          data: { parentId: category.parentId },
        });
      }

      await tx.category.delete({ where: { id: categoryId } });
    }, SERIALIZABLE);
  } catch (error) {
    if (isPrismaErrorCode(error, "P2034")) throw new ServiceError("CONFLICT", MSG.concurrent);
    if (isPrismaErrorCode(error, "P2003")) throw new ServiceError("CONFLICT", MSG.hasChildren);
    throw error;
  }
}

/** Sets sortOrder = index for siblings under `parentId`. `orderedIds` must be exactly the sibling set. */
export async function reorderCategories(input: ReorderCategoriesInput): Promise<void> {
  const { parentId, orderedIds } = parseOrThrow(reorderCategoriesSchema, input);
  if (new Set(orderedIds).size !== orderedIds.length) {
    throw new ServiceError("VALIDATION", MSG.reorderMismatch);
  }

  await prisma.$transaction(async (tx) => {
    const siblings = await tx.category.findMany({
      where: { parentId },
      select: { id: true },
    });
    const siblingIds = new Set(siblings.map((s) => s.id));
    if (
      siblingIds.size !== orderedIds.length ||
      !orderedIds.every((oid) => siblingIds.has(oid))
    ) {
      throw new ServiceError("VALIDATION", MSG.reorderMismatch);
    }

    await Promise.all(
      orderedIds.map((categoryId, index) =>
        tx.category.update({ where: { id: categoryId }, data: { sortOrder: index } }),
      ),
    );
  });
}
