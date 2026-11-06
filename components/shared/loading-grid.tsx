import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface LoadingGridProps {
  count?: number;
  className?: string;
}

/** Skeleton placeholder matching <ProductGrid /> layout. */
export function LoadingGrid({ count = 8, className }: LoadingGridProps) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="در حال بارگذاری"
      className={cn(
        "grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4",
        className,
      )}
    >
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-xl" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
      <span className="sr-only">در حال بارگذاری…</span>
    </div>
  );
}
