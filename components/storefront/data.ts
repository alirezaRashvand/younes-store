import "server-only";

import { cache } from "react";
import { connection } from "next/server";
import { type StoreSettingsView } from "@/features/store-settings/service";
import { getCachedStoreSettings } from "@/features/public-cache";

export const DEFAULT_STORE_NAME = "یونس";

/**
 * Request-deduplicated settings lookup shared by header, footer and mobile nav.
 * Falls back to `null` so chrome never takes the whole page down if the DB blips.
 *
 * `connection()` opts into request-time rendering *before* the try/catch, so a
 * failed lookup can never be baked into the prerendered static shell.
 */
export const getSettingsForChrome = cache(async (): Promise<StoreSettingsView | null> => {
  await connection();
  try {
    return await getCachedStoreSettings();
  } catch (error) {
    console.error("[storefront] failed to load store settings", error);
    return null;
  }
});
