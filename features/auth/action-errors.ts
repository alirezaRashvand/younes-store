import "server-only";

import { actionError, toActionError, type ActionFailure } from "@/lib/action-result";
import { AuthenticationError, AuthorizationError } from "@/features/auth/permissions";

/**
 * Like toActionError(), but also maps auth failures thrown by requireAdmin()
 * into a Persian message instead of the generic "unexpected error".
 */
export function toAdminActionError(error: unknown): ActionFailure {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return actionError(error.message);
  }
  return toActionError(error);
}
