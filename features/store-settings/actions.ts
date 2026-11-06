"use server";

import { actionOk, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/features/auth/permissions";
import { toAdminActionError } from "@/features/auth/action-errors";
import { revalidateAfterAdminWrite } from "@/features/admin/revalidate";
import { resolveAssetAssociation } from "@/features/media/service";
import {
  updateStoreSettings,
  type StoreSettingsView,
} from "@/features/store-settings/service";

export interface StoreSettingsFormPayload {
  storeName: string;
  /** undefined = unchanged, null = remove logo, string = a verified "logo/" upload. */
  logoKey?: string | null;
  mobilePhones: string[];
  landlinePhones: string[];
  address: string | null;
  instagramUrl: string | null;
  telegramUrl: string | null;
  whatsappUrl: string | null;
  additionalDescription: string | null;
}

export type StoreSettingsSaved = Pick<
  StoreSettingsView,
  | "storeName"
  | "logoKey"
  | "logoUrl"
  | "mobilePhones"
  | "landlinePhones"
  | "address"
  | "instagramUrl"
  | "telegramUrl"
  | "whatsappUrl"
  | "additionalDescription"
>;

export async function updateStoreSettingsAction(
  payload: StoreSettingsFormPayload,
): Promise<ActionResult<StoreSettingsSaved>> {
  try {
    const admin = await requireAdmin();
    // Logo URL is derived from the verified asset, never taken from the client.
    const logo = await resolveAssetAssociation(admin, payload.logoKey, "logo");

    const saved = await updateStoreSettings({
      storeName: payload.storeName,
      mobilePhones: payload.mobilePhones,
      landlinePhones: payload.landlinePhones,
      address: payload.address,
      instagramUrl: payload.instagramUrl,
      telegramUrl: payload.telegramUrl,
      whatsappUrl: payload.whatsappUrl,
      additionalDescription: payload.additionalDescription,
      ...(logo ? { logoKey: logo.imageKey, logoUrl: logo.imageUrl } : {}),
    });
    revalidateAfterAdminWrite();
    return actionOk({
      storeName: saved.storeName,
      logoKey: saved.logoKey,
      logoUrl: saved.logoUrl,
      mobilePhones: saved.mobilePhones,
      landlinePhones: saved.landlinePhones,
      address: saved.address,
      instagramUrl: saved.instagramUrl,
      telegramUrl: saved.telegramUrl,
      whatsappUrl: saved.whatsappUrl,
      additionalDescription: saved.additionalDescription,
    });
  } catch (error) {
    return toAdminActionError(error);
  }
}
