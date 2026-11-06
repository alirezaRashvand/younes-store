import { randomBytes } from "node:crypto";
import { slugifyPersian } from "@/lib/format";

/** Allowed slug: Persian/latin letters, digits, single hyphens between parts. */
export const SLUG_REGEX = /^[\u0600-\u06FFa-z0-9]+(?:-[\u0600-\u06FFa-z0-9]+)*$/;

export function normalizeSlug(input: string): string {
  return slugifyPersian(input);
}

export function isValidSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 120 && SLUG_REGEX.test(slug);
}

/**
 * Produce a unique slug based on `base` by appending -2, -3, ... when taken.
 * `exists` should check the DB (ideally inside the same transaction).
 */
export async function ensureUniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  let root = normalizeSlug(base);
  if (!root) {
    root = `item-${randomBytes(4).toString("hex")}`;
  }
  root = root.slice(0, 110);

  if (!(await exists(root))) return root;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${root}-${i}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${root}-${randomBytes(4).toString("hex")}`;
}
