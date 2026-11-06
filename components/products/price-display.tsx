import { PhoneCallIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatToman } from "@/lib/format";
import { Badge } from "@/components/ui/badge";

interface PriceDisplayProps {
  /** Price in Toman. `null` means "contact us for price". */
  price: bigint | number | null | undefined;
  /** When provided and <= 0, an «ناموجود» badge is shown. */
  stockQuantity?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-2xl sm:text-3xl",
} as const;

export function PriceDisplay({
  price,
  stockQuantity,
  size = "md",
  className,
}: PriceDisplayProps) {
  const outOfStock = stockQuantity !== undefined && stockQuantity <= 0;
  const hasPrice = price !== null && price !== undefined;

  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1.5", className)}>
      {hasPrice ? (
        <span
          className={cn(
            "font-extrabold tabular-nums",
            sizeClasses[size],
            outOfStock ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {formatToman(price)}
        </span>
      ) : (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 font-bold text-primary",
            sizeClasses[size],
          )}
        >
          <PhoneCallIcon className="size-[1em]" aria-hidden="true" />
          {formatToman(null)}
        </span>
      )}
      {outOfStock ? <Badge variant="muted">ناموجود</Badge> : null}
    </div>
  );
}
