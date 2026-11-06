import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { absoluteUrl } from "@/lib/seo";
import {
  firstParam,
  flattenSearchParams,
  parsePage,
  resolveProductSort,
} from "@/lib/search-params";
import { getCategoryContext } from "@/features/categories/public";
import { listPublishedProducts } from "@/features/products/service";
import { CategoryBreadcrumbs } from "@/components/categories/category-breadcrumbs";
import { CategoryCard } from "@/components/categories/category-card";
import { ProductGrid } from "@/components/products/product-grid";
import { ProductSort } from "@/components/products/product-sort";
import { JsonLd } from "@/components/shared/json-ld";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";

export const instant = false;

const PAGE_SIZE = 12;

export async function generateMetadata({
  params,
  searchParams,
}: PageProps<"/categories/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const context = await getCategoryContext(slug);
  if (!context) return { title: "دسته‌بندی یافت نشد", robots: { index: false } };

  const { category } = context;
  const page = parsePage(firstParam((await searchParams).page));
  const description =
    category.description?.trim().slice(0, 160) ||
    `محصولات دسته‌بندی ${category.name} در فروشگاه یونس.`;
  const canonical = `${routes.category(category.slug)}${page > 1 ? `?page=${page}` : ""}`;

  return {
    title: category.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "fa_IR",
      title: category.name,
      description,
      url: canonical,
      ...(category.imageUrl ? { images: [{ url: category.imageUrl }] } : {}),
    },
  };
}

export default async function CategoryPage({
  params,
  searchParams,
}: PageProps<"/categories/[slug]">) {
  const { slug } = await params;
  const context = await getCategoryContext(slug);
  if (!context) notFound();

  const { category, path, children } = context;
  const query = flattenSearchParams(await searchParams);
  const sort = resolveProductSort(query.sort);
  const page = parsePage(query.page);

  // Includes products of all descendant categories; PUBLISHED only.
  const result = await listPublishedProducts({
    categoryId: category.id,
    page,
    pageSize: PAGE_SIZE,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
  });
  if (page > result.totalPages) notFound();

  const basePath = routes.category(category.slug);
  const carried = { sort: sort.value === "newest" ? undefined : sort.value };

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "خانه", item: absoluteUrl(routes.home) },
      { "@type": "ListItem", position: 2, name: "محصولات", item: absoluteUrl(routes.products) },
      ...path.map((c, i) => ({
        "@type": "ListItem",
        position: i + 3,
        name: c.name,
        item: absoluteUrl(routes.category(c.slug)),
      })),
    ],
  };

  return (
    <div className="container-page py-8">
      <JsonLd data={breadcrumbLd} />
      <PageHeader
        breadcrumbs={<CategoryBreadcrumbs path={path} />}
        title={category.name}
        description={category.description ?? undefined}
      />

      {children.length > 0 ? (
        <section aria-labelledby="subcategories" className="mb-10">
          <h2 id="subcategories" className="mb-4 text-lg font-bold">
            زیردسته‌ها
          </h2>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {children.map((child) => (
              <li key={child.id}>
                <CategoryCard category={child} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="category-products" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="category-products" className="text-lg font-bold">
            محصولات
            {result.total > 0 ? (
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                ({toPersianDigits(result.total)} محصول)
              </span>
            ) : null}
          </h2>
          {result.total > 1 ? (
            <ProductSort basePath={basePath} current={sort.value} searchParams={carried} />
          ) : null}
        </div>

        <ProductGrid
          products={result.items}
          emptyTitle="محصولی در این دسته‌بندی وجود ندارد"
          emptyDescription={
            children.length > 0
              ? "زیردسته‌ها را بررسی کنید یا بعداً دوباره سر بزنید."
              : "به‌زودی محصولات این دسته‌بندی منتشر می‌شوند."
          }
        />

        <PaginationControls
          page={result.page}
          totalPages={result.totalPages}
          basePath={basePath}
          searchParams={carried}
        />
      </section>
    </div>
  );
}