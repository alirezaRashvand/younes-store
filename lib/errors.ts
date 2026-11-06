import { ZodError, type ZodType } from "zod";

export type ServiceErrorCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "FORBIDDEN"
  | "UNAUTHENTICATED"
  | "RATE_LIMITED"
  | "UNAVAILABLE"
  | "INTERNAL";

/**
 * Error with a safe, user-facing (Persian) message.
 * Services throw this; actions/route handlers convert it into a result.
 */
export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly fieldErrors?: Record<string, string[]>;

  constructor(
    code: ServiceErrorCode,
    message: string,
    fieldErrors?: Record<string, string[]>,
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export function zodFieldErrors(error: ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

/** Parse with a zod schema; throws ServiceError(VALIDATION) with Persian message. */
export function parseOrThrow<S extends ZodType>(
  schema: S,
  input: unknown,
): ReturnType<S["parse"]> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fieldErrors = zodFieldErrors(result.error);
    const first = result.error.issues[0]?.message ?? "اطلاعات واردشده معتبر نیست.";
    throw new ServiceError("VALIDATION", first, fieldErrors);
  }
  return result.data as ReturnType<S["parse"]>;
}

export function isPrismaErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === code
  );
}

/** Unique constraint violation */
export function isUniqueViolation(error: unknown): boolean {
  return isPrismaErrorCode(error, "P2002");
}
