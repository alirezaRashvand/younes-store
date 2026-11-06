const FALLBACK_SITE_URL = "http://localhost:3000";

/** Canonical origin (no trailing slash). Safe to call anywhere on the server. */
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim() || FALLBACK_SITE_URL;
  try {
    return new URL(raw).origin;
  } catch {
    return FALLBACK_SITE_URL;
  }
}

/** Absolute URL for a path or an already-absolute URL. */
export function absoluteUrl(pathOrUrl: string): string {
  try {
    return new URL(pathOrUrl, `${getSiteUrl()}/`).toString();
  } catch {
    return getSiteUrl();
  }
}

/** Serialize JSON-LD so it can never terminate the surrounding <script> tag. */
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
