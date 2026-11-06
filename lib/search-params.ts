export type RawSearchParams = Record<string, string | string[] | undefined>;

/** First value of a query param (Next gives string | string[] | undefined). */
export function firstParam(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === undefined || v === "" ? undefined : v;
}

/** Collapses repeated params into a flat string map (first value wins). */
export function flattenSearchParams(raw: RawSearchParams): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const v = firstParam(value);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

export const PRODUCT_SORT_OPTIONS = [
  { value: "newest", label: "جدیدترین", sortBy: "createdAt", sortDir: "desc" },
  { value: "price-asc", label: "ارزان‌ترین", sortBy: "price", sortDir: "asc" },
  { value: "price-desc", label: "گران‌ترین", sortBy: "price", sortDir: "desc" },
  { value: "name", label: "نام (الف تا ی)", sortBy: "name", sortDir: "asc" },
] as const;

export type ProductSortValue = (typeof PRODUCT_SORT_OPTIONS)[number]["value"];

export function resolveProductSort(value: string | undefined) {
  return (
    PRODUCT_SORT_OPTIONS.find((option) => option.value === value) ?? PRODUCT_SORT_OPTIONS[0]
  );
}

export function parsePage(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 100_000 ? n : 1;
}
