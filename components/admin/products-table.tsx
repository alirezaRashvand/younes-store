"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  ImageOffIcon,
  PencilIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { formatToman, toPersianDigits } from "@/lib/format";
import { LOW_STOCK_THRESHOLD } from "@/features/products/constants";
import { archiveProductAction, restoreProductAction } from "@/features/products/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABELS,
  formatDate,
} from "@/components/admin/admin-utils";

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string;
  price: number | null;
  stockQuantity: number;
  status: keyof typeof STATUS_LABELS;
  /** ISO string */
  updatedAt: string;
  categoryNames: string[];
  thumbnailUrl: string | null;
}

export type ProductSortField = "name" | "price" | "stockQuantity" | "updatedAt";

interface ProductsTableProps {
  items: AdminProductRow[];
  sortBy: string;
  sortDir: "asc" | "desc";
  /** Active filters (search/category/status/stock/pageSize) to keep when sorting. */
  query: Record<string, string>;
}

function SortHeader({
  field,
  label,
  sortBy,
  sortDir,
  query,
  className,
}: {
  field: ProductSortField;
  label: string;
  sortBy: string;
  sortDir: "asc" | "desc";
  query: Record<string, string>;
  className?: string;
}) {
  const active = sortBy === field;
  const nextDir = active && sortDir === "asc" ? "desc" : "asc";
  const params = new URLSearchParams(query);
  params.set("sort", field);
  params.set("dir", nextDir);
  const Icon = !active ? ArrowUpDownIcon : sortDir === "asc" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <TableHead
      className={className}
      aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={`${routes.admin.products}?${params.toString()}`}
        className={cn(
          "-mx-2 inline-flex items-center gap-1 rounded px-2 py-1 outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
          active && "text-foreground",
        )}
        aria-label={`مرتب‌سازی بر اساس ${label} (${nextDir === "asc" ? "صعودی" : "نزولی"})`}
      >
        {label}
        <Icon className={cn("size-3.5", !active && "opacity-50")} aria-hidden="true" />
      </Link>
    </TableHead>
  );
}

function StockCell({ quantity }: { quantity: number }) {
  if (quantity <= 0) return <Badge variant="destructive">ناموجود</Badge>;
  if (quantity <= LOW_STOCK_THRESHOLD) {
    return (
      <span className="inline-flex items-center gap-2">
        <span className="tabular-nums">{toPersianDigits(quantity)}</span>
        <Badge variant="warning">کم‌موجودی</Badge>
      </span>
    );
  }
  return <span className="tabular-nums">{toPersianDigits(quantity)}</span>;
}

function RowActions({ row }: { row: AdminProductRow }) {
  const router = useRouter();
  const archived = row.status === "ARCHIVED";

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    const result = await action();
    if (!result.ok) {
      toast.error(result.error ?? "عملیات ناموفق بود.");
      return;
    }
    toast.success(success);
    router.refresh();
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild variant="ghost" size="sm">
        <Link
          href={routes.admin.productEdit(row.id)}
          aria-label={`ویرایش ${row.name}`}
        >
          <PencilIcon aria-hidden="true" />
          ویرایش
        </Link>
      </Button>

      {archived ? (
        <ConfirmDialog
          title="بازگردانی محصول؟"
          description={`«${row.name}» به‌صورت پیش‌نویس بازگردانده می‌شود و تا زمان انتشار در فروشگاه دیده نمی‌شود.`}
          confirmLabel="بازگردانی"
          onConfirm={() => run(() => restoreProductAction(row.id), "محصول به پیش‌نویس بازگردانده شد.")}
          trigger={
            <Button variant="ghost" size="sm" aria-label={`بازگردانی ${row.name}`}>
              <ArchiveRestoreIcon aria-hidden="true" />
              بازگردانی
            </Button>
          }
        />
      ) : (
        <ConfirmDialog
          destructive
          title="بایگانی محصول؟"
          description={`«${row.name}» بایگانی می‌شود و دیگر در فروشگاه نمایش داده نخواهد شد. اطلاعات آن حذف نمی‌شود و بعداً می‌توانید آن را بازگردانید.`}
          confirmLabel="بایگانی"
          onConfirm={() => run(() => archiveProductAction(row.id), "محصول بایگانی شد.")}
          trigger={
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              aria-label={`بایگانی ${row.name}`}
            >
              <ArchiveIcon aria-hidden="true" />
              بایگانی
            </Button>
          }
        />
      )}
    </div>
  );
}

export function ProductsTable({ items, sortBy, sortDir, query }: ProductsTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16">
            <span className="sr-only">تصویر</span>
          </TableHead>
          <SortHeader field="name" label="نام محصول" sortBy={sortBy} sortDir={sortDir} query={query} />
          <TableHead>دسته‌بندی</TableHead>
          <SortHeader field="price" label="قیمت" sortBy={sortBy} sortDir={sortDir} query={query} />
          <SortHeader
            field="stockQuantity"
            label="موجودی"
            sortBy={sortBy}
            sortDir={sortDir}
            query={query}
          />
          <TableHead>وضعیت</TableHead>
          <SortHeader
            field="updatedAt"
            label="آخرین ویرایش"
            sortBy={sortBy}
            sortDir={sortDir}
            query={query}
          />
          <TableHead className="text-end">
            <span className="sr-only">عملیات</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow key={row.id} className={cn(row.status === "ARCHIVED" && "opacity-70")}>
            <TableCell>
              <div className="flex size-12 items-center justify-center overflow-hidden rounded-md border bg-muted">
                {row.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={row.thumbnailUrl}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : (
                  <ImageOffIcon className="size-4 text-muted-foreground" aria-label="بدون تصویر" />
                )}
              </div>
            </TableCell>
            <TableCell className="max-w-64">
              <Link
                href={routes.admin.productEdit(row.id)}
                className="line-clamp-2 font-semibold hover:text-primary hover:underline"
              >
                {row.name}
              </Link>
              <span dir="ltr" className="block truncate text-start text-xs text-muted-foreground">
                {row.slug}
              </span>
            </TableCell>
            <TableCell className="max-w-48">
              {row.categoryNames.length > 0 ? (
                <span className="line-clamp-2 text-muted-foreground">
                  {row.categoryNames.join("، ")}
                </span>
              ) : (
                <span className="text-muted-foreground/70">—</span>
              )}
            </TableCell>
            <TableCell className="whitespace-nowrap tabular-nums">
              {row.price === null ? (
                <span className="text-muted-foreground">بدون قیمت</span>
              ) : (
                formatToman(row.price)
              )}
            </TableCell>
            <TableCell>
              <StockCell quantity={row.stockQuantity} />
            </TableCell>
            <TableCell>
              <Badge variant={STATUS_BADGE_VARIANT[row.status]}>{STATUS_LABELS[row.status]}</Badge>
            </TableCell>
            <TableCell className="whitespace-nowrap text-muted-foreground">
              {formatDate(row.updatedAt)}
            </TableCell>
            <TableCell>
              <RowActions row={row} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
