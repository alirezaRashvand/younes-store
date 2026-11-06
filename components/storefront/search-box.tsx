"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SearchIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

interface SearchBoxProps {
  className?: string;
  placeholder?: string;
  /** Called after a search is submitted (e.g. to close a sheet). */
  onSearch?: () => void;
}

/**
 * Uses useSearchParams → render inside <Suspense> (with cacheComponents).
 * Progressive: without JS the form submits GET /products?search=…
 */
export function SearchBox({
  className,
  placeholder = "جست‌وجوی محصول…",
  onSearch,
}: SearchBoxProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlValue = pathname === routes.products ? (params.get("search") ?? "") : "";
  const [value, setValue] = React.useState(urlValue);
  const [syncedUrlValue, setSyncedUrlValue] = React.useState(urlValue);
  const inputId = React.useId();

  // Keep the input in sync when navigation changes the URL (adjust state during render).
  if (urlValue !== syncedUrlValue) {
    setSyncedUrlValue(urlValue);
    setValue(urlValue);
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const q = value.trim();
    router.push(q ? `${routes.products}?search=${encodeURIComponent(q)}` : routes.products);
    onSearch?.();
  }

  return (
    <form
      role="search"
      action={routes.products}
      method="get"
      onSubmit={handleSubmit}
      className={cn("relative w-full", className)}
    >
      <label htmlFor={inputId} className="sr-only">
        جست‌وجو در محصولات
      </label>
      <SearchIcon
        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden="true"
      />
      <input
        id={inputId}
        name="search"
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        maxLength={100}
        enterKeyHint="search"
        className="h-10 w-full rounded-md border border-input bg-secondary/60 ps-9 pe-9 text-sm transition-[background-color,box-shadow,border-color] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value ? (
        <button
          type="button"
          onClick={() => setValue("")}
          aria-label="پاک کردن عبارت جست‌وجو"
          className="absolute end-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
        >
          <XIcon className="size-3.5" aria-hidden="true" />
        </button>
      ) : null}
    </form>
  );
}
