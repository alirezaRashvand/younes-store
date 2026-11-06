import type { Metadata } from "next";

import { routes } from "@/lib/routes";
import { firstParam, parsePage } from "@/lib/search-params";
import { ProductCatalog } from "@/components/products/product-catalog";

export const instant = false;

export async function generateMetadata({ searchParams }: PageProps<"/products">): Promise<Metadata> {
  const query = await searchParams;
  const page = parsePage(firstParam(query.page));
  const searching = Boolean(firstParam(query.search));
  const filtered = ["category", "minPrice", "maxPrice", "stock", "sort"].some((key) =>
    Boolean(firstParam(query[key])),
  );

  return {
    title: "همه محصولات",
    description: "فهرست محصولات فروشگاه یونس؛ تجهیزات گرمایشی، سرمایشی و ابزارآلات با مشخصات دقیق.",
    alternates: { canonical: `${routes.products}${page > 1 && !searching && !filtered ? `?page=${page}` : ""}` },
    // Filtered / searched variants are not worth indexing.
    robots: searching || filtered ? { index: false, follow: true } : undefined,
  };
}

export default async function ProductsPage({ searchParams }: PageProps<"/products">) {
  return (
    <ProductCatalog
      basePath={routes.products}
      searchParams={await searchParams}
      title="همه محصولات"
      description="محصولات منتشرشده فروشگاه؛ با فیلتر و مرتب‌سازی پیدا کنید."
    />
  );
}
