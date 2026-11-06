import Link from "next/link";

import { cn } from "@/lib/utils";
import { PRODUCT_SORT_OPTIONS, type ProductSortValue } from "@/lib/search-params";

interface ProductSortProps {
  basePath: string;
  current: ProductSortValue;
  /** Query params to keep (page and sort are reset/replaced). */
  searchParams?: Record<string, string | undefined>;
  className?: string;
}

function hrefFor(
  basePath: string,
  searchParams: ProductSortProps["searchParams"],
  sort: ProductSortValue,
) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === "page" || key === "sort" || value === undefined) continue;
    qs.set(key, value);
  }
  if (sort !== "newest") qs.set("sort", sort);
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Link-based (no JS needed) sort switcher. */
export function ProductSort({ basePath, current, searchParams, className }: ProductSortProps) {
  return (
    <nav aria-label="مرتب‌سازی" className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-sm text-muted-foreground">مرتب‌سازی:</span>
      <ul className="flex flex-wrap gap-1.5">
        {PRODUCT_SORT_OPTIONS.map((option) => {
          const active = option.value === current;
          return (
            <li key={option.value}>
              <Link
                href={hrefFor(basePath, searchParams, option.value)}
                aria-current={active ? "true" : undefined}
                scroll={false}
                className={cn(
                  "inline-flex h-8 items-center rounded-full border px-3 text-[0.8125rem] font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
                  active
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background hover:bg-accent",
                )}
              >
                {option.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
