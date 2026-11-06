import "server-only";

import { cache } from "react";
import { getCachedPublishedProduct } from "@/features/public-cache";

/**
 * Published-product lookup shared by generateMetadata and the page itself:
 * request-deduplicated (React `cache`) on top of the tagged cross-request cache.
 * Unpublished products resolve to null (→ 404, no metadata).
 */
export const getPublishedProduct = cache(async (slug: string) => getCachedPublishedProduct(slug));
