import "server-only";

import { cache } from "react";
import { type FlatCategory } from "@/features/categories/service";
import { getCachedCategoriesFlat } from "@/features/public-cache";
import { buildCategoryPath } from "@/features/categories/tree";

export interface CategoryContext {
  category: FlatCategory;
  /** Root → … → category (category last). */
  path: FlatCategory[];
  /** Direct children, ordered. */
  children: FlatCategory[];
}

function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).toLowerCase();
  } catch {
    return slug.toLowerCase();
  }
}

/** One query for the whole tree; request-deduplicated for metadata + page. */
export const getCategoryContext = cache(
  async (slug: string): Promise<CategoryContext | null> => {
    if (!slug) return null;
    const all = await getCachedCategoriesFlat();
    const wanted = decodeSlug(slug);
    const category = all.find((c) => c.slug === wanted);
    if (!category) return null;
    return {
      category,
      path: buildCategoryPath(all, category.id),
      children: all.filter((c) => c.parentId === category.id),
    };
  },
);
