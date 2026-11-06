import "server-only";

import { prisma } from "@/lib/db";
import { PublicationStatus } from "@/generated/prisma/client";
import { assertAdmin } from "@/features/auth/permissions";
import type { SessionUser } from "@/features/auth/session";
import { LOW_STOCK_THRESHOLD } from "@/features/products/schema";
import { listProducts, type ProductListItem } from "@/features/products/service";

export interface DashboardStats {
  totalProducts: number;
  publishedProducts: number;
  draftProducts: number;
  archivedProducts: number;
  outOfStockProducts: number;
  lowStockProducts: number;
  totalCategories: number;
  recentProducts: ProductListItem[];
}

/** Real counts straight from the database. No sales / revenue figures exist, so none are shown. */
export async function getDashboardStats(
  actor: Pick<SessionUser, "role"> | null | undefined,
): Promise<DashboardStats> {
  assertAdmin(actor);

  const [
    totalProducts,
    publishedProducts,
    draftProducts,
    archivedProducts,
    outOfStockProducts,
    lowStockProducts,
    totalCategories,
    recent,
  ] = await Promise.all([
    prisma.product.count(),
    prisma.product.count({ where: { status: PublicationStatus.PUBLISHED } }),
    prisma.product.count({ where: { status: PublicationStatus.DRAFT } }),
    prisma.product.count({ where: { status: PublicationStatus.ARCHIVED } }),
    prisma.product.count({ where: { stockQuantity: { lte: 0 } } }),
    prisma.product.count({ where: { stockQuantity: { gt: 0, lte: LOW_STOCK_THRESHOLD } } }),
    prisma.category.count(),
    listProducts({ page: 1, pageSize: 6, sortBy: "createdAt", sortDir: "desc" }),
  ]);

  return {
    totalProducts,
    publishedProducts,
    draftProducts,
    archivedProducts,
    outOfStockProducts,
    lowStockProducts,
    totalCategories,
    recentProducts: recent.items,
  };
}

/** categoryId -> number of products directly linked to it. */
export async function getCategoryProductCounts(
  actor: Pick<SessionUser, "role"> | null | undefined,
): Promise<Record<string, number>> {
  assertAdmin(actor);
  const rows = await prisma.productCategory.groupBy({
    by: ["categoryId"],
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.categoryId, r._count._all]));
}
