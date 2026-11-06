import "server-only";

import { prisma } from "@/lib/db";
import { parseOrThrow } from "@/lib/errors";
import {
  updateStoreSettingsSchema,
  type UpdateStoreSettingsInput,
} from "@/features/store-settings/schema";

export const STORE_SETTINGS_ID = "default";

export interface StoreSettingsView {
  id: string;
  storeName: string;
  logoKey: string | null;
  logoUrl: string | null;
  mobilePhones: string[];
  landlinePhones: string[];
  address: string | null;
  instagramUrl: string | null;
  telegramUrl: string | null;
  whatsappUrl: string | null;
  additionalDescription: string | null;
  updatedAt: Date;
}

/** Returns the singleton settings row, creating it with defaults if missing. */
export async function getStoreSettings(): Promise<StoreSettingsView> {
  return prisma.storeSettings.upsert({
    where: { id: STORE_SETTINGS_ID },
    create: { id: STORE_SETTINGS_ID },
    update: {},
  });
}

export async function updateStoreSettings(
  input: UpdateStoreSettingsInput,
): Promise<StoreSettingsView> {
  const data = parseOrThrow(updateStoreSettingsSchema, input);

  const update = {
    ...(data.storeName !== undefined && { storeName: data.storeName }),
    ...(data.logoKey !== undefined && { logoKey: data.logoKey }),
    ...(data.logoUrl !== undefined && { logoUrl: data.logoUrl }),
    ...(data.mobilePhones !== undefined && { mobilePhones: data.mobilePhones }),
    ...(data.landlinePhones !== undefined && { landlinePhones: data.landlinePhones }),
    ...(data.address !== undefined && { address: data.address }),
    ...(data.instagramUrl !== undefined && { instagramUrl: data.instagramUrl }),
    ...(data.telegramUrl !== undefined && { telegramUrl: data.telegramUrl }),
    ...(data.whatsappUrl !== undefined && { whatsappUrl: data.whatsappUrl }),
    ...(data.additionalDescription !== undefined && {
      additionalDescription: data.additionalDescription,
    }),
  };

  return prisma.storeSettings.upsert({
    where: { id: STORE_SETTINGS_ID },
    create: { id: STORE_SETTINGS_ID, ...update },
    update,
  });
}

/** Read-only (no upsert) so it is cheap enough for layouts; falls back to the schema default. */
export async function getStoreName(): Promise<string> {
  const row = await prisma.storeSettings.findUnique({
    where: { id: STORE_SETTINGS_ID },
    select: { storeName: true },
  });
  return row?.storeName ?? "یونس";
}
