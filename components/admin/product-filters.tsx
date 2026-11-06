"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2Icon, SearchIcon, XIcon } from "lucide-react";

import type { CategoryOption } from "@/features/categories/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS, STOCK_FILTER_LABELS } from "@/components/admin/admin-utils";

const ALL = "__all__";

export interface ProductFilterValues {
  search: string;
  category: string;
  status: string;
  stock: string;
}

interface ProductFiltersProps {
  values: ProductFilterValues;
  categoryOptions: CategoryOption[];
  /** Sorting is kept in the URL when filters change. */
  sort?: string;
  dir?: string;
}

/** URL-driven filters: every change rewrites the query string and resets to page 1. */
export function ProductFilters({ values, categoryOptions, sort, dir }: ProductFiltersProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();
  const [search, setSearch] = React.useState(values.search);

  // Keep the input in sync when the URL changes from outside (e.g. "clear filters").
  const [syncedSearch, setSyncedSearch] = React.useState(values.search);
  if (values.search !== syncedSearch) {
    setSyncedSearch(values.search);
    setSearch(values.search);
  }

  function navigate(next: Partial<ProductFilterValues>) {
    const merged = { ...values, search, ...next };
    const params = new URLSearchParams();
    if (merged.search.trim()) params.set("q", merged.search.trim());
    if (merged.category) params.set("category", merged.category);
    if (merged.status) params.set("status", merged.status);
    if (merged.stock) params.set("stock", merged.stock);
    if (sort) params.set("sort", sort);
    if (dir) params.set("dir", dir);
    const qs = params.toString();
    startTransition(() => router.push(qs ? `${pathname}?${qs}` : pathname));
  }

  const hasFilters = Boolean(values.search || values.category || values.status || values.stock);

  return (
    <form
      role="search"
      aria-label="فیلتر محصولات"
      onSubmit={(event) => {
        event.preventDefault();
        navigate({});
      }}
      className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-4"
    >
      <div className="grid min-w-56 flex-1 gap-1.5">
        <label htmlFor="product-search" className="text-[0.8125rem] font-semibold">
          جستجو
        </label>
        <div className="relative">
          <SearchIcon
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            id="product-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="نام یا نامک محصول"
            className="ps-9"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="grid w-full gap-1.5 sm:w-52">
        <label id="filter-category-label" className="text-[0.8125rem] font-semibold">
          دسته‌بندی
        </label>
        <Select
          value={values.category || ALL}
          onValueChange={(value) => navigate({ category: value === ALL ? "" : value })}
        >
          <SelectTrigger className="w-full" aria-labelledby="filter-category-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>همه دسته‌بندی‌ها</SelectItem>
            {categoryOptions.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid w-full gap-1.5 sm:w-40">
        <label id="filter-status-label" className="text-[0.8125rem] font-semibold">
          وضعیت
        </label>
        <Select
          value={values.status || ALL}
          onValueChange={(value) => navigate({ status: value === ALL ? "" : value })}
        >
          <SelectTrigger className="w-full" aria-labelledby="filter-status-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>همه وضعیت‌ها</SelectItem>
            {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((key) => (
              <SelectItem key={key} value={key}>
                {STATUS_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid w-full gap-1.5 sm:w-40">
        <label id="filter-stock-label" className="text-[0.8125rem] font-semibold">
          موجودی
        </label>
        <Select
          value={values.stock || ALL}
          onValueChange={(value) => navigate({ stock: value === ALL ? "" : value })}
        >
          <SelectTrigger className="w-full" aria-labelledby="filter-stock-label">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>همه</SelectItem>
            {(Object.keys(STOCK_FILTER_LABELS) as Array<keyof typeof STOCK_FILTER_LABELS>).map(
              (key) => (
                <SelectItem key={key} value={key}>
                  {STOCK_FILTER_LABELS[key]}
                </SelectItem>
              ),
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <SearchIcon aria-hidden="true" />
          )}
          اعمال
        </Button>
        {hasFilters ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch("");
              navigate({ search: "", category: "", status: "", stock: "" });
            }}
          >
            <XIcon aria-hidden="true" />
            پاک کردن
          </Button>
        ) : null}
      </div>
    </form>
  );
}
