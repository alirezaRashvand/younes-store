import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2Icon, PhoneIcon, XCircleIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { isEmptyTiptapDoc, tiptapToPlainText } from "@/lib/rich-text";
import { absoluteUrl } from "@/lib/seo";
import { getCategoryPath } from "@/features/categories/service";
import { getPublishedProduct } from "@/features/products/public";
import { LOW_STOCK_THRESHOLD } from "@/features/products/schema";
import { listRelatedPublishedProducts } from "@/features/products/service";
import { AddToCartButton } from "@/components/cart/add-to-cart-button";
import { CategoryBreadcrumbs } from "@/components/categories/category-breadcrumbs";
import { PriceDisplay } from "@/components/products/price-display";
import { ProductGallery } from "@/components/products/product-gallery";
import { ProductGrid } from "@/components/products/product-grid";
import { RichTextRenderer } from "@/components/products/rich-text-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { JsonLd } from "@/components/shared/json-ld";
import { getSettingsForChrome } from "@/components/storefront/data";

export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/products/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const product = await getPublishedProduct(slug);
  // Unpublished / missing products expose nothing.
  if (!product) return { title: "محصول یافت نشد", robots: { index: false, follow: false } };

  const description =
    tiptapToPlainText(product.description, 160) ||
    `مشخصات و قیمت ${product.name} در فروشگاه یونس.`;
  const canonical = routes.product(product.slug);
  const image = product.images[0];

  return {
    title: product.name,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "fa_IR",
      title: product.name,
      description,
      url: canonical,
      ...(image ? { images: [{ url: image.url, alt: image.altText ?? product.name }] } : {}),
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title: product.name,
      description,
      ...(image ? { images: [image.url] } : {}),
    },
  };
}

export default async function ProductPage({ params }: PageProps<"/products/[slug]">) {
  const { slug } = await params;
  const product = await getPublishedProduct(slug);
  if (!product) notFound();

  const categoryIds = product.categories.map((c) => c.category.id);
  const primaryCategory = product.categories[0]?.category;

  const [path, related, settings] = await Promise.all([
    primaryCategory ? getCategoryPath(primaryCategory.id) : Promise.resolve([]),
    listRelatedPublishedProducts(product.id, categoryIds, 4),
    getSettingsForChrome(),
  ]);

  const hasPrice = product.price !== null;
  const inStock = product.stockQuantity > 0;
  const purchasable = hasPrice && inStock;
  const lowStock = inStock && product.stockQuantity <= LOW_STOCK_THRESHOLD;
  const contactPhone = settings?.mobilePhones[0] ?? settings?.landlinePhones[0] ?? null;
  const plainDescription = tiptapToPlainText(product.description, 500);

  // schema.org requires an ISO-4217 currency; prices are stored in Toman (1 Toman = 10 IRR).
  const productLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: absoluteUrl(routes.product(product.slug)),
    ...(product.images.length > 0 && { image: product.images.map((i) => absoluteUrl(i.url)) }),
    ...(plainDescription && { description: plainDescription }),
    ...(primaryCategory && { category: primaryCategory.name }),
    ...(product.price !== null && {
      offers: {
        "@type": "Offer",
        url: absoluteUrl(routes.product(product.slug)),
        priceCurrency: "IRR",
        price: (product.price * BigInt(10)).toString(),
        availability: inStock
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      },
    }),
  };

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
      { "@type": "ListItem", position: path.length + 3, name: product.name },
    ],
  };

  return (
    <div className="container-page py-8">
      <JsonLd data={productLd} />
      <JsonLd data={breadcrumbLd} />

      <CategoryBreadcrumbs path={path} trailing={product.name} className="mb-6" />

      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-12">
        <ProductGallery
          images={product.images.map((i) => ({ id: i.id, url: i.url, altText: i.altText }))}
          productName={product.name}
          className="lg:sticky lg:top-24"
        />

        <div className="space-y-6">
          <header className="space-y-3">
            {product.categories.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" aria-label="دسته‌بندی‌ها">
                {product.categories.map(({ category }) => (
                  <li key={category.id}>
                    <Link href={routes.category(category.slug)}>
                      <Badge variant="secondary" className="hover:bg-secondary/70">
                        {category.name}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <h1 className="text-2xl leading-10 font-extrabold sm:text-3xl">{product.name}</h1>
          </header>

          <div className="space-y-4 rounded-xl border bg-card p-5">
            <PriceDisplay price={product.price} size="lg" />

            <p
              className={
                inStock
                  ? "flex items-center gap-2 text-sm font-semibold text-success"
                  : "flex items-center gap-2 text-sm font-semibold text-muted-foreground"
              }
            >
              {inStock ? (
                <CheckCircle2Icon className="size-4" aria-hidden="true" />
              ) : (
                <XCircleIcon className="size-4" aria-hidden="true" />
              )}
              {inStock
                ? lowStock
                  ? `موجود؛ تنها ${toPersianDigits(product.stockQuantity)} عدد باقی مانده است`
                  : "موجود"
                : "ناموجود"}
            </p>

            {purchasable ? (
              <AddToCartButton productId={product.id} stockQuantity={product.stockQuantity} />
            ) : (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm leading-7 text-muted-foreground">
                  {!hasPrice
                    ? "قیمت این محصول مشخص نشده است. برای اطلاع از قیمت و سفارش با فروشگاه تماس بگیرید."
                    : "این محصول در حال حاضر موجود نیست. برای اطلاع از زمان تأمین با فروشگاه تماس بگیرید."}
                </p>
                {contactPhone ? (
                  <Button asChild variant="outline">
                    <a href={`tel:${contactPhone}`}>
                      <PhoneIcon aria-hidden="true" />
                      <span dir="ltr" className="tabular-nums">
                        {toPersianDigits(contactPhone)}
                      </span>
                    </a>
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      {!isEmptyTiptapDoc(product.description) ? (
        <section aria-labelledby="product-description" className="mt-12 max-w-3xl">
          <h2 id="product-description" className="mb-4 border-b pb-3 text-xl font-extrabold">
            توضیحات و مشخصات
          </h2>
          <RichTextRenderer content={product.description} />
        </section>
      ) : null}

      {related.length > 0 ? (
        <section aria-labelledby="related-products" className="mt-16">
          <h2 id="related-products" className="mb-6 text-xl font-extrabold">
            محصولات مرتبط
          </h2>
          <ProductGrid products={related} priorityCount={0} />
        </section>
      ) : null}
    </div>
  );
}
