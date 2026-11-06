import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { getStoreSettings, type StoreSettingsView } from "@/features/store-settings/service";
import { listCategoriesFlat, type FlatCategory } from "@/features/categories/service";
import { getProductBySlug, type ProductDetail } from "@/features/products/service";

/**
 * Cross-request cache for public (non-personalized) storefront reads.
 *
 * Only data that is identical for every visitor lives here. Admin mutations
 * expire these tags via `expirePublicCache()` (read-your-own-writes), so a
 * product that is unpublished/archived disappears from public pages on the
 * very next request. Unpublished products are never cached: the product
 * lookup only returns PUBLISHED rows.
 */
export const PUBLIC_CACHE_TAGS = {
  storeSettings: "store-settings",
  categories: "categories",
  products: "products",
} as const;

export async function getCachedStoreSettings(): Promise<StoreSettingsView> {
  "use cache";
  cacheTag(PUBLIC_CACHE_TAGS.storeSettings);
  cacheLife("hours");
  return getStoreSettings();
}

export async function getCachedCategoriesFlat(): Promise<FlatCategory[]> {
  "use cache";
  cacheTag(PUBLIC_CACHE_TAGS.categories);
  cacheLife("hours");
  return listCategoriesFlat();
}

export async function getCachedPublishedProduct(slug: string): Promise<ProductDetail | null> {
  "use cache";
  cacheTag(PUBLIC_CACHE_TAGS.products);
  cacheLife("hours");
  return getProductBySlug(slug);
}
