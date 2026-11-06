import type { Metadata } from "next";

import { isS3Configured } from "@/lib/storage/s3";
import { requireAdminPage } from "@/features/auth/guard";
import { listCategoryTree } from "@/features/categories/service";
import { getCategoryProductCounts } from "@/features/admin/stats";
import { PageHeader } from "@/components/shared/page-header";
import { CategoryTreeManager } from "@/components/admin/category-tree-manager";

export const instant = false;
export const metadata: Metadata = { title: "دسته‌بندی‌ها" };

export default async function AdminCategoriesPage() {
  const admin = await requireAdminPage();
  const [tree, productCounts] = await Promise.all([
    listCategoryTree(),
    getCategoryProductCounts(admin),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="کاتالوگ"
        title="دسته‌بندی‌ها"
        description="درخت دسته‌بندی‌ها را بسازید، مرتب کنید، جابه‌جا کنید و تصویر بگذارید."
      />
      <CategoryTreeManager
        tree={tree}
        productCounts={productCounts}
        uploadsEnabled={isS3Configured()}
      />
    </>
  );
}
