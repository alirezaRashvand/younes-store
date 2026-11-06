import Image from "next/image";
import Link from "next/link";
import { PackageIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { PriceDisplay } from "@/components/products/price-display";

/** Structural subset of `ProductListItem` so the card can be reused anywhere. */
export interface ProductCardData {
  id: string;
  name: string;
  slug: string;
  price: bigint | number | null;
  stockQuantity: number;
  images: ReadonlyArray<{ url: string; altText: string | null }>;
  categories?: ReadonlyArray<{ category: { name: string } }>;
}

interface ProductCardProps {
  product: ProductCardData;
  /** Mark above-the-fold cards for eager image loading. */
  priority?: boolean;
  className?: string;
}

export function ProductCard({ product, priority = false, className }: ProductCardProps) {
  const image = product.images[0];
  const outOfStock = product.stockQuantity <= 0;
  const categoryName = product.categories?.[0]?.category.name;

  return (
    <Link
      href={routes.product(product.slug)}
      className={cn(
        "group flex flex-col gap-3 rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className,
      )}
    >
      <div className="relative aspect-square overflow-hidden rounded-xl border bg-muted/50">
        {image ? (
          <Image
            src={image.url}
            alt={image.altText || product.name}
            fill
            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 33vw, 50vw"
            priority={priority}
            unoptimized
            className={cn(
              "object-contain p-3 transition-transform duration-500 ease-out group-hover:scale-[1.04]",
              outOfStock && "opacity-60 grayscale-[40%]",
            )}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground/60">
            <PackageIcon className="size-10" aria-hidden="true" />
            <span className="sr-only">بدون تصویر</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1.5 px-0.5">
        {categoryName ? (
          <span className="text-xs font-medium text-muted-foreground">{categoryName}</span>
        ) : null}
        <h3 className="line-clamp-2 text-sm leading-6 font-semibold text-foreground transition-colors group-hover:text-primary sm:text-[0.9375rem]">
          {product.name}
        </h3>
        <PriceDisplay
          price={product.price}
          stockQuantity={product.stockQuantity}
          size="sm"
          className="mt-auto pt-1"
        />
      </div>
    </Link>
  );
}
