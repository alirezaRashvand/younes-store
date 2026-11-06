import "server-only";

import { revalidatePath, updateTag } from "next/cache";
import { PUBLIC_CACHE_TAGS } from "@/features/public-cache";

/**
 * Called from admin Server Actions after a successful write.
 * Expires the cross-request public data cache (read-your-own-writes) and the
 * rendered route tree, so menus, product pages, listings, footer contact info
 * and metadata reflect the change — and unpublished products vanish — on the
 * next request.
 */
export function revalidateAfterAdminWrite(): void {
  updateTag(PUBLIC_CACHE_TAGS.storeSettings);
  updateTag(PUBLIC_CACHE_TAGS.categories);
  updateTag(PUBLIC_CACHE_TAGS.products);
  revalidatePath("/", "layout");
}
