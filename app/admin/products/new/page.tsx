import type { Metadata } from "next";

import { routes } from "@/lib/routes";
import { isS3Configured } from "@/lib/storage/s3";
import { requireAdminPage } from "@/features/auth/guard";
import { listCategoryTree } from "@/features/categories/service";
import { flattenCategoryOptions } from "@/features/categories/options";
import { PageHeader } from "@/components/shared/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";

export const instant = false;
export const metadata: Metadata = { title: "محصول جدید" };

export default async function NewProductPage() {
  await requireAdminPage();
  const tree = await listCategoryTree();

  return (
    <>
      <PageHeader
        breadcrumbs={
          <AdminBreadcrumb
            items={[
              { label: "محصولات", href: routes.admin.products },
              { label: "محصول جدید" },
            ]}
          />
        }
        title="محصول جدید"
        description="اطلاعات محصول را وارد کنید. می‌توانید آن را ابتدا به‌صورت پیش‌نویس ذخیره کنید."
      />
      <ProductForm
        mode="create"
        categoryOptions={flattenCategoryOptions(tree)}
        uploadsEnabled={isS3Configured()}
        initial={{
          name: "",
          slug: "",
          price: "",
          stockQuantity: "0",
          status: "DRAFT",
          categoryIds: [],
          description: null,
          images: [],
        }}
      />
    </>
  );
}
