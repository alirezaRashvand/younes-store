"use server";

import { revalidatePath } from "next/cache";
import { actionOk, type ActionResult } from "@/lib/action-result";
import { requireAdmin } from "@/features/auth/permissions";
import { toAdminActionError } from "@/features/auth/action-errors";
import { routes } from "@/lib/routes";
import type { ConfirmUploadInput, PresignUploadInput } from "@/features/media/schema";
import {
  confirmUpload,
  deleteMediaAsset,
  presignUpload,
} from "@/features/media/service";

export interface PresignUploadData {
  key: string;
  uploadUrl: string;
  publicUrl: string;
  headers: Record<string, string>;
}

export interface ConfirmUploadData {
  id: string;
  storageKey: string;
  url: string;
}

/** Step 1: validate type/size and return a presigned PUT URL. */
export async function presignUploadAction(
  input: PresignUploadInput,
): Promise<ActionResult<PresignUploadData>> {
  try {
    const admin = await requireAdmin();
    // Every field is re-validated by the zod schema inside the service.
    const presigned = await presignUpload(admin, input);
    return actionOk({
      key: presigned.key,
      uploadUrl: presigned.uploadUrl,
      publicUrl: presigned.publicUrl,
      headers: presigned.headers,
    });
  } catch (error) {
    return toAdminActionError(error);
  }
}

/** Step 3: after the client PUT, verify the object exists in S3 and register it. */
export async function confirmUploadAction(
  input: ConfirmUploadInput,
): Promise<ActionResult<ConfirmUploadData>> {
  try {
    const admin = await requireAdmin();
    const asset = await confirmUpload(admin, input);
    revalidatePath(routes.admin.media);
    return actionOk(asset);
  } catch (error) {
    return toAdminActionError(error);
  }
}

/** Deletes an unreferenced media asset by id (never by arbitrary key). */
export async function deleteMediaAction(id: string): Promise<ActionResult> {
  try {
    const admin = await requireAdmin();
    await deleteMediaAsset(admin, { id });
    revalidatePath(routes.admin.media);
    return actionOk(null);
  } catch (error) {
    return toAdminActionError(error);
  }
}
