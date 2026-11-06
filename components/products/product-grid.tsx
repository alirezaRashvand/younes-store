import { PackageSearchIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductCard, type ProductCardData } from "@/components/products/product-card";

interface ProductGridProps {
  products: ReadonlyArray<ProductCardData>;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Number of leading cards loaded eagerly. */
  priorityCount?: number;
  className?: string;
}

export function ProductGrid({
  products,
  emptyTitle = "محصولی پیدا نشد",
  emptyDescription = "فیلترها را تغییر دهید یا عبارت دیگری را جست‌وجو کنید.",
  emptyAction,
  priorityCount = 4,
  className,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <EmptyState
        icon={PackageSearchIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <ul
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {products.map((product, index) => (
        <li key={product.id} className="animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}>
          <ProductCard product={product} priority={index < priorityCount} />
        </li>
      ))}
    </ul>
  );
}
