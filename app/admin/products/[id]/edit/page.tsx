import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { routes } from "@/lib/routes";
import { isS3Configured } from "@/lib/storage/s3";
import { requireAdminPage } from "@/features/auth/guard";
import { listCategoryTree } from "@/features/categories/service";
import { flattenCategoryOptions } from "@/features/categories/options";
import { getProductById } from "@/features/products/service";
import { PageHeader } from "@/components/shared/page-header";
import { ProductForm } from "@/components/admin/product-form";
import { AdminBreadcrumb } from "@/components/admin/admin-breadcrumb";

export const instant = false;
export const metadata: Metadata = { title: "ویرایش محصول" };

export default async function EditProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdminPage();
  const { id } = await params;

  const [product, tree] = await Promise.all([getProductById(id), listCategoryTree()]);
  if (!product) notFound();

  // Remount the form whenever the saved data changes so new uploads pick up their database ids.
  const formKey = `${product.updatedAt.getTime()}-${product.images.map((i) => i.id).join(",")}`;

  return (
    <>
      <PageHeader
        breadcrumbs={
          <AdminBreadcrumb
            items={[
              { label: "محصولات", href: routes.admin.products },
              { label: product.name },
            ]}
          />
        }
        title="ویرایش محصول"
        description={product.name}
      />
      <ProductForm
        key={formKey}
        mode="edit"
        categoryOptions={flattenCategoryOptions(tree)}
        uploadsEnabled={isS3Configured()}
        initial={{
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: product.price === null ? "" : product.price.toString(),
          stockQuantity: String(product.stockQuantity),
          status: product.status,
          categoryIds: product.categories.map((c) => c.category.id),
          description: product.description,
          images: product.images.map((image) => ({
            id: image.id,
            key: image.storageKey,
            url: image.url,
            altText: image.altText,
          })),
        }}
      />
    </>
  );
}
