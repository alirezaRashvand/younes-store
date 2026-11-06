/** In-memory replacement for the `next/headers` cookie store used in integration tests. */

export interface CookieRecord {
  name: string;
  value: string;
  options: Record<string, unknown>;
}

const jar = new Map<string, CookieRecord>();

export const cookieJar = {
  get(name: string): { name: string; value: string } | undefined {
    const record = jar.get(name);
    return record ? { name: record.name, value: record.value } : undefined;
  },
  getAll(): Array<{ name: string; value: string }> {
    return Array.from(jar.values(), ({ name, value }) => ({ name, value }));
  },
  has(name: string): boolean {
    return jar.has(name);
  },
  set(name: string, value: string, options: Record<string, unknown> = {}): void {
    // Like Next: setting an empty value / maxAge 0 / past expiry deletes the cookie,
    // but we keep the last write observable via `lastWrite`.
    lastWrites.set(name, { name, value, options });
    const expires = options.expires instanceof Date ? options.expires.getTime() : undefined;
    if (value === "" || options.maxAge === 0 || (expires !== undefined && expires <= Date.now())) {
      jar.delete(name);
      return;
    }
    jar.set(name, { name, value, options });
  },
  delete(name: string): void {
    jar.delete(name);
  },
  /** Options of the cookie currently stored (httpOnly, sameSite, ...). */
  options(name: string): Record<string, unknown> | undefined {
    return jar.get(name)?.options;
  },
  lastWrite(name: string): CookieRecord | undefined {
    return lastWrites.get(name);
  },
  clear(): void {
    jar.clear();
    lastWrites.clear();
  },
};

const lastWrites = new Map<string, CookieRecord>();

/** Request headers visible through the mocked `headers()`. */
export const headerJar = new Map<string, string>();
