import Link from "next/link";
import { connection } from "next/server";
import { ShoppingCartIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getCurrentCartItemCount } from "@/features/cart/summary";

function CartLink({ count }: { count: number }) {
  return (
    <Link
      href={routes.cart}
      className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "relative")}
      aria-label={count > 0 ? `سبد خرید، ${toPersianDigits(count)} کالا` : "سبد خرید"}
    >
      <ShoppingCartIcon aria-hidden="true" />
      {count > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -end-0.5 -top-0.5 flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-full bg-primary px-1 text-[0.6875rem] leading-none font-bold text-primary-foreground tabular-nums ring-2 ring-background"
        >
          {count > 99 ? `${toPersianDigits(99)}+` : toPersianDigits(count)}
        </span>
      ) : null}
    </Link>
  );
}

/** Suspense fallback / static shell: cart link without a count. */
export function CartIndicatorFallback() {
  return <CartLink count={0} />;
}

/**
 * Async server component: reads cookies (session / guest cart), so it must be
 * rendered inside <Suspense fallback={<CartIndicatorFallback />}>.
 */
export async function CartIndicator() {
  // Dynamic before try/catch so the hanging-cookies rejection is never swallowed.
  await connection();
  let count = 0;
  try {
    count = await getCurrentCartItemCount();
  } catch (error) {
    console.error("[storefront] failed to load cart count", error);
  }
  return <CartLink count={count} />;
}
