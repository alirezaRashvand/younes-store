import type { MetadataRoute } from "next";
import { connection } from "next/server";

import { routes } from "@/lib/routes";
import { absoluteUrl } from "@/lib/seo";
import { listCategoriesFlat } from "@/features/categories/service";
import { listPublishedProductSitemapEntries } from "@/features/products/service";

/**
 * Lists the public storefront only. Products come from the PUBLISHED-only query,
 * so drafts/archived items never leak. Rendered per request (reads the database).
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();

  const entries: MetadataRoute.Sitemap = [
    { url: absoluteUrl(routes.home), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl(routes.categories), changeFrequency: "weekly", priority: 0.7 },
    { url: absoluteUrl(routes.products), changeFrequency: "daily", priority: 0.8 },
  ];

  const [categories, products] = await Promise.all([
    listCategoriesFlat(),
    listPublishedProductSitemapEntries(),
  ]);

  for (const category of categories) {
    entries.push({
      url: absoluteUrl(routes.category(category.slug)),
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const product of products) {
    entries.push({
      url: absoluteUrl(routes.product(product.slug)),
      lastModified: product.updatedAt,
      changeFrequency: "weekly",
      priority: 0.7,
    });
  }

  return entries;
}
