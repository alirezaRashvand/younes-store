import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/format";

interface PaginationControlsProps {
  page: number;
  totalPages: number;
  /** Path without query string, e.g. "/products". */
  basePath: string;
  /** Existing query params to preserve (page is replaced). */
  searchParams?: Record<string, string | string[] | undefined>;
  className?: string;
}

function buildHref(
  basePath: string,
  searchParams: PaginationControlsProps["searchParams"],
  page: number,
) {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (key === "page" || value === undefined) continue;
    for (const v of Array.isArray(value) ? value : [value]) qs.append(key, v);
  }
  if (page > 1) qs.set("page", String(page));
  const s = qs.toString();
  return s ? `${basePath}?${s}` : basePath;
}

/** Compact page list with ellipsis: 1 … 4 [5] 6 … 20 */
function getPageItems(page: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const items: Array<number | "gap"> = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) items.push("gap");
  for (let p = start; p <= end; p++) items.push(p);
  if (end < total - 1) items.push("gap");
  items.push(total);
  return items;
}

const itemBase =
  "inline-flex h-9 min-w-9 items-center justify-center rounded-md border px-2 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40";

export function PaginationControls({
  page,
  totalPages,
  basePath,
  searchParams,
  className,
}: PaginationControlsProps) {
  if (totalPages <= 1) return null;
  const current = Math.min(Math.max(page, 1), totalPages);

  return (
    <nav
      aria-label="صفحه‌بندی"
      className={cn("flex items-center justify-center gap-1.5", className)}
    >
      {current > 1 ? (
        <Link
          href={buildHref(basePath, searchParams, current - 1)}
          rel="prev"
          aria-label="صفحه قبل"
          className={cn(itemBase, "bg-background hover:bg-accent")}
        >
          <ChevronRightIcon className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(itemBase, "opacity-40")}>
          <ChevronRightIcon className="size-4" />
        </span>
      )}

      {getPageItems(current, totalPages).map((item, i) =>
        item === "gap" ? (
          <span
            key={`gap-${i}`}
            aria-hidden="true"
            className="px-1 text-muted-foreground"
          >
            …
          </span>
        ) : item === current ? (
          <span
            key={item}
            aria-current="page"
            className={cn(itemBase, "border-primary bg-primary text-primary-foreground")}
          >
            {toPersianDigits(item)}
          </span>
        ) : (
          <Link
            key={item}
            href={buildHref(basePath, searchParams, item)}
            aria-label={`صفحه ${toPersianDigits(item)}`}
            className={cn(itemBase, "bg-background hover:bg-accent")}
          >
            {toPersianDigits(item)}
          </Link>
        ),
      )}

      {current < totalPages ? (
        <Link
          href={buildHref(basePath, searchParams, current + 1)}
          rel="next"
          aria-label="صفحه بعد"
          className={cn(itemBase, "bg-background hover:bg-accent")}
        >
          <ChevronLeftIcon className="size-4" aria-hidden="true" />
        </Link>
      ) : (
        <span aria-hidden="true" className={cn(itemBase, "opacity-40")}>
          <ChevronLeftIcon className="size-4" />
        </span>
      )}
    </nav>
  );
}
