import Link from "next/link";
import { notFound } from "next/navigation";
import { PackageSearchIcon, SearchIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import {
  flattenSearchParams,
  parsePage,
  resolveProductSort,
  type RawSearchParams,
} from "@/lib/search-params";
import { listCategoryTree, type CategoryNode } from "@/features/categories/service";
import { listPublishedProducts } from "@/features/products/service";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { ProductGrid } from "@/components/products/product-grid";
import { ProductSort } from "@/components/products/product-sort";

const PAGE_SIZE = 12;

const fieldClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30";

interface CategoryOption {
  slug: string;
  id: string;
  label: string;
}

function flattenForSelect(nodes: ReadonlyArray<CategoryNode>, depth = 0): CategoryOption[] {
  return nodes.flatMap((node) => [
    { id: node.id, slug: node.slug, label: `${"— ".repeat(depth)}${node.name}` },
    ...flattenForSelect(node.children, depth + 1),
  ]);
}

interface ProductCatalogProps {
  /** Route this catalog is mounted on ("/products" or "/search"). */
  basePath: string;
  searchParams: RawSearchParams;
  title: string;
  description?: string;
}

/**
 * Published-products catalog with GET-form filters (search, category, price range,
 * in-stock), link-based sorting and pagination. Works without JavaScript.
 * Async + DB-backed: render on a dynamic route (loading.tsx / Suspense above).
 */
export async function ProductCatalog({
  basePath,
  searchParams,
  title,
  description,
}: ProductCatalogProps) {
  const params = flattenSearchParams(searchParams);
  const sort = resolveProductSort(params.sort);
  const page = parsePage(params.page);
  const search = params.search?.trim().slice(0, 100) || undefined;
  const inStockOnly = params.stock === "in_stock";

  const tree = await listCategoryTree();
  const options = flattenForSelect(tree);
  const selectedCategory = params.category
    ? options.find((option) => option.slug === params.category)
    : undefined;

  const result = await listPublishedProducts({
    search,
    categoryId: selectedCategory?.id,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    stock: inStockOnly ? "in_stock" : undefined,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
  });

  if (page > result.totalPages) notFound();

  // Only normalized values are carried into links.
  const carried: Record<string, string | undefined> = {
    search,
    category: selectedCategory?.slug,
    minPrice: params.minPrice,
    maxPrice: params.maxPrice,
    stock: inStockOnly ? "in_stock" : undefined,
    sort: sort.value === "newest" ? undefined : sort.value,
  };
  const hasFilters = Object.entries(carried).some(
    ([key, value]) => key !== "sort" && value !== undefined,
  );

  return (
    <div className="container-page py-8">
      <PageHeader
        title={search ? `نتایج جست‌وجو برای «${search}»` : title}
        description={description}
      />

      <div className="grid items-start gap-8 lg:grid-cols-[16rem_1fr]">
        <form
          method="get"
          action={basePath}
          role="search"
          aria-label="فیلتر محصولات"
          className="space-y-4 rounded-xl border bg-card p-4 lg:sticky lg:top-24"
        >
          {sort.value !== "newest" ? <input type="hidden" name="sort" value={sort.value} /> : null}

          <div className="space-y-1.5">
            <label htmlFor="f-search" className="text-sm font-semibold">
              عبارت جست‌وجو
            </label>
            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                id="f-search"
                name="search"
                type="search"
                defaultValue={search ?? ""}
                maxLength={100}
                placeholder="نام محصول…"
                className={`${fieldClass} ps-9`}
              />
            </div>
          </div>

          {options.length > 0 ? (
            <div className="space-y-1.5">
              <label htmlFor="f-category" className="text-sm font-semibold">
                دسته‌بندی
              </label>
              <select
                id="f-category"
                name="category"
                defaultValue={selectedCategory?.slug ?? ""}
                className={fieldClass}
              >
                <option value="">همه دسته‌بندی‌ها</option>
                {options.map((option) => (
                  <option key={option.id} value={option.slug}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-semibold">محدوده قیمت (تومان)</legend>
            <div className="flex items-center gap-2">
              <input
                name="minPrice"
                inputMode="numeric"
                dir="ltr"
                aria-label="حداقل قیمت"
                placeholder="از"
                defaultValue={params.minPrice ?? ""}
                maxLength={18}
                className={`${fieldClass} text-center tabular-nums`}
              />
              <span aria-hidden="true" className="text-muted-foreground">
                –
              </span>
              <input
                name="maxPrice"
                inputMode="numeric"
                dir="ltr"
                aria-label="حداکثر قیمت"
                placeholder="تا"
                defaultValue={params.maxPrice ?? ""}
                maxLength={18}
                className={`${fieldClass} text-center tabular-nums`}
              />
            </div>
          </fieldset>

          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              name="stock"
              value="in_stock"
              defaultChecked={inStockOnly}
              className="size-4 accent-[var(--primary)]"
            />
            فقط کالاهای موجود
          </label>

          <div className="flex gap-2 pt-1">
            <Button type="submit" className="flex-1">
              اعمال فیلتر
            </Button>
            {hasFilters ? (
              <Button asChild variant="outline">
                <Link href={basePath}>پاک کردن</Link>
              </Button>
            ) : null}
          </div>
        </form>

        <section aria-label="نتایج" className="min-w-0 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {result.total > 0
                ? `${toPersianDigits(result.total)} محصول`
                : "محصولی یافت نشد"}
            </p>
            <ProductSort basePath={basePath} current={sort.value} searchParams={carried} />
          </div>

          {result.items.length === 0 ? (
            <EmptyState
              icon={PackageSearchIcon}
              title={hasFilters ? "محصولی با این مشخصات پیدا نشد" : "هنوز محصولی منتشر نشده است"}
              description={
                hasFilters
                  ? "فیلترها را تغییر دهید یا عبارت دیگری را جست‌وجو کنید."
                  : "به‌زودی محصولات فروشگاه در این بخش نمایش داده می‌شوند."
              }
              action={
                hasFilters ? (
                  <Button asChild variant="outline">
                    <Link href={basePath}>حذف همه فیلترها</Link>
                  </Button>
                ) : (
                  <Button asChild variant="outline">
                    <Link href={routes.home}>بازگشت به خانه</Link>
                  </Button>
                )
              }
            />
          ) : (
            <ProductGrid products={result.items} />
          )}

          <PaginationControls
            page={result.page}
            totalPages={result.totalPages}
            basePath={basePath}
            searchParams={carried}
          />
        </section>
      </div>
    </div>
  );
}
