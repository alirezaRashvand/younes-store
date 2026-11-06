import Link from "next/link";
import type { Metadata } from "next";
import { PackageIcon, PlusIcon, SearchXIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { requireAdminPage } from "@/features/auth/guard";
import { listCategoryTree } from "@/features/categories/service";
import { flattenCategoryOptions } from "@/features/categories/options";
import { listProducts } from "@/features/products/service";
import {
  PRODUCT_SORT_FIELDS,
  PRODUCT_STATUSES,
  STOCK_FILTERS,
} from "@/features/products/schema";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { ProductFilters } from "@/components/admin/product-filters";
import {
  ProductsTable,
  type AdminProductRow,
} from "@/components/admin/products-table";

export const instant = false;
export const metadata: Metadata = { title: "محصولات" };

const PAGE_SIZE = 20;

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

function oneOf<T extends string>(value: string, allowed: readonly T[]): T | "" {
  return (allowed as readonly string[]).includes(value) ? (value as T) : "";
}

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdminPage();
  const raw = await searchParams;

  const search = first(raw.q).trim().slice(0, 100);
  const category = first(raw.category).slice(0, 64);
  const status = oneOf(first(raw.status), PRODUCT_STATUSES);
  const stock = oneOf(first(raw.stock), STOCK_FILTERS);
  const sortBy = oneOf(first(raw.sort), PRODUCT_SORT_FIELDS) || "updatedAt";
  const sortDir = first(raw.dir) === "asc" ? "asc" : "desc";

  void admin; // session verified above; services below are read-only listings

  const [result, tree] = await Promise.all([
    listProducts({
      search: search || undefined,
      categoryId: category || undefined,
      status: status || undefined,
      stock: stock || undefined,
      page: first(raw.page) || 1,
      pageSize: PAGE_SIZE,
      sortBy,
      sortDir,
    }),
    listCategoryTree(),
  ]);
  const categoryOptions = flattenCategoryOptions(tree);

  const rows: AdminProductRow[] = result.items.map((product) => ({
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: product.price === null ? null : Number(product.price),
    stockQuantity: product.stockQuantity,
    status: product.status,
    updatedAt: product.updatedAt.toISOString(),
    categoryNames: product.categories.map((c) => c.category.name),
    thumbnailUrl: product.images[0]?.url ?? null,
  }));

  const filterQuery: Record<string, string> = {};
  if (search) filterQuery.q = search;
  if (category) filterQuery.category = category;
  if (status) filterQuery.status = status;
  if (stock) filterQuery.stock = stock;

  const paginationParams: Record<string, string> = {
    ...filterQuery,
    sort: sortBy,
    dir: sortDir,
  };
  const hasFilters = Object.keys(filterQuery).length > 0;

  return (
    <>
      <PageHeader
        eyebrow="کاتالوگ"
        title="محصولات"
        description={`${toPersianDigits(result.total)} محصول${hasFilters ? " مطابق فیلترها" : ""}`}
        actions={
          <Button asChild>
            <Link href={routes.admin.productNew}>
              <PlusIcon aria-hidden="true" />
              محصول جدید
            </Link>
          </Button>
        }
      />

      <div className="space-y-4">
        <ProductFilters
          values={{ search, category, status, stock }}
          categoryOptions={categoryOptions}
          sort={sortBy}
          dir={sortDir}
        />

        {rows.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={SearchXIcon}
              title="محصولی با این فیلترها پیدا نشد"
              description="فیلترها را تغییر دهید یا پاک کنید."
              action={
                <Button asChild variant="outline">
                  <Link href={routes.admin.products}>پاک کردن فیلترها</Link>
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={PackageIcon}
              title="هنوز محصولی ثبت نشده است"
              description="اولین محصول فروشگاه را اضافه کنید."
              action={
                <Button asChild>
                  <Link href={routes.admin.productNew}>
                    <PlusIcon aria-hidden="true" />
                    افزودن محصول
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <>
            <ProductsTable items={rows} sortBy={sortBy} sortDir={sortDir} query={filterQuery} />
            <PaginationControls
              page={result.page}
              totalPages={result.totalPages}
              basePath={routes.admin.products}
              searchParams={paginationParams}
              className="pt-2"
            />
          </>
        )}
      </div>
    </>
  );
}
