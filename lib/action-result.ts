import { ServiceError } from "@/lib/errors";

export type ActionFailure = {
  ok: false;
  error: string;
  fieldErrors?: Record<string, string[]>;
};

export type ActionSuccess<T> = { ok: true; data: T };

export type ActionResult<T = null> = ActionSuccess<T> | ActionFailure;

export function actionOk<T>(data: T): ActionSuccess<T> {
  return { ok: true, data };
}

export function actionError(
  error: string,
  fieldErrors?: Record<string, string[]>,
): ActionFailure {
  return { ok: false, error, fieldErrors };
}

/** Convert any thrown value into a safe action failure. */
export function toActionError(error: unknown): ActionFailure {
  if (error instanceof ServiceError) {
    return actionError(error.message, error.fieldErrors);
  }
  console.error("[action] unexpected error", error);
  return actionError("خطای غیرمنتظره‌ای رخ داد. لطفاً دوباره تلاش کنید.");
}
