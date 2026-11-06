import type { Metadata } from "next";

import { routes } from "@/lib/routes";
import { ProductCatalog } from "@/components/products/product-catalog";

export const instant = false;

export const metadata: Metadata = {
  title: "جست‌وجوی محصولات",
  description: "جست‌وجو در محصولات فروشگاه یونس با فیلتر دسته‌بندی، قیمت و موجودی.",
  robots: { index: false, follow: true },
};

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  return (
    <ProductCatalog
      basePath={routes.search}
      searchParams={await searchParams}
      title="جست‌وجوی محصولات"
      description="نام محصول را جست‌وجو کنید و بر اساس دسته‌بندی، قیمت و موجودی فیلتر کنید."
    />
  );
}
