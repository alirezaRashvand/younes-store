import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LayersIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { listCategoryTree } from "@/features/categories/service";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryCard } from "@/components/categories/category-card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export const metadata: Metadata = {
  title: "دسته‌بندی محصولات",
  description: "دسته‌بندی‌های محصولات فروشگاه یونس؛ تجهیزات گرمایشی، سرمایشی و ابزارآلات.",
  alternates: { canonical: routes.categories },
};

async function RootCategories() {
  await connection();
  const roots = await listCategoryTree();

  if (roots.length === 0) {
    return (
      <EmptyState
        icon={LayersIcon}
        title="هنوز دسته‌بندی‌ای ثبت نشده است"
        description="به‌زودی دسته‌بندی محصولات در این بخش نمایش داده می‌شود."
        action={
          <Button asChild variant="outline">
            <Link href={routes.products}>مشاهده همه محصولات</Link>
          </Button>
        }
      />
    );
  }

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {roots.map((category) => (
        <li key={category.id}>
          <CategoryCard category={category} />
        </li>
      ))}
    </ul>
  );
}

export default function CategoriesPage() {
  return (
    <div className="container-page py-8">
      <PageHeader
        title="دسته‌بندی محصولات"
        description="دسته‌بندی مورد نظر خود را انتخاب کنید."
      />
      <Suspense
        fallback={
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        }
      >
        <RootCategories />
      </Suspense>
    </div>
  );
}
