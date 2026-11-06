import Image from "next/image";
import Link from "next/link";
import { ChevronLeftIcon, LayersIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

export interface CategoryCardData {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  imageUrl?: string | null;
}

interface CategoryCardProps {
  category: CategoryCardData;
  className?: string;
}

export function CategoryCard({ category, className }: CategoryCardProps) {
  return (
    <Link
      href={routes.category(category.slug)}
      className={cn(
        "group relative flex items-center gap-4 rounded-xl border bg-card p-3 pe-4 transition-[border-color,box-shadow] duration-200 outline-none hover:border-primary/40 hover:shadow-md focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className,
      )}
    >
      <span className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground sm:size-20">
        {category.imageUrl ? (
          <Image
            src={category.imageUrl}
            alt=""
            fill
            sizes="80px"
            unoptimized
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <LayersIcon className="size-7" aria-hidden="true" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold">{category.name}</span>
        {category.description ? (
          <span className="mt-0.5 line-clamp-2 block text-[0.8125rem] leading-6 text-muted-foreground">
            {category.description}
          </span>
        ) : null}
      </span>
      <ChevronLeftIcon
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-0.5 group-hover:text-primary ltr:rotate-180"
        aria-hidden="true"
      />
    </Link>
  );
}
