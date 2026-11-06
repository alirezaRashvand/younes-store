"use client";

import * as React from "react";
import Image from "next/image";
import { ChevronLeftIcon, ChevronRightIcon, PackageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/format";

export interface GalleryImage {
  id: string;
  url: string;
  altText: string | null;
}

interface ProductGalleryProps {
  images: ReadonlyArray<GalleryImage>;
  productName: string;
  className?: string;
}

export function ProductGallery({ images, productName, className }: ProductGalleryProps) {
  const [index, setIndex] = React.useState(0);
  const count = images.length;
  const active = images[Math.min(index, Math.max(count - 1, 0))];

  const go = React.useCallback(
    (delta: number) => setIndex((i) => (i + delta + count) % count),
    [count],
  );

  if (!active) {
    return (
      <div
        className={cn(
          "flex aspect-square items-center justify-center rounded-2xl border bg-muted/50 text-muted-foreground/60",
          className,
        )}
      >
        <PackageIcon className="size-16" aria-hidden="true" />
        <span className="sr-only">این محصول تصویری ندارد</span>
      </div>
    );
  }

  return (
    <div
      className={cn("flex flex-col gap-3", className)}
      role="group"
      aria-roledescription="گالری تصاویر"
      aria-label={`تصاویر ${productName}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl border bg-card">
        <Image
          key={active.id}
          src={active.url}
          alt={active.altText || `${productName} - تصویر ${toPersianDigits(index + 1)}`}
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          priority
          unoptimized
          className="animate-fade-in object-contain p-4"
        />
        {count > 1 ? (
          <>
            {/* RTL: «قبلی» sits on the right, «بعدی» on the left */}
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="تصویر قبلی"
              className="absolute start-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm backdrop-blur transition-colors outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <ChevronRightIcon className="size-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="تصویر بعدی"
              className="absolute end-3 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border bg-background/90 shadow-sm backdrop-blur transition-colors outline-none hover:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <ChevronLeftIcon className="size-4" aria-hidden="true" />
            </button>
            <span
              className="absolute bottom-3 start-3 rounded-md bg-foreground/70 px-2 py-0.5 text-xs font-medium text-background tabular-nums"
              aria-live="polite"
            >
              {toPersianDigits(index + 1)} / {toPersianDigits(count)}
            </span>
          </>
        ) : null}
      </div>

      {count > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="تصاویر بندانگشتی">
          {images.map((image, i) => (
            <li key={image.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`نمایش تصویر ${toPersianDigits(i + 1)}`}
                aria-current={i === index}
                className={cn(
                  "relative block size-16 overflow-hidden rounded-lg border bg-card outline-none transition-[border-color,box-shadow] focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:size-20",
                  i === index
                    ? "border-primary ring-1 ring-primary"
                    : "opacity-75 hover:opacity-100",
                )}
              >
                <Image
                  src={image.url}
                  alt=""
                  fill
                  sizes="80px"
                  unoptimized
                  className="object-contain p-1"
                />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
