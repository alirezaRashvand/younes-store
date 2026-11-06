"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MinusIcon, PlusIcon, ShoppingCartIcon } from "lucide-react";
import { toast } from "sonner";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { addToCartAction } from "@/features/cart/actions";
import { Button } from "@/components/ui/button";

const MAX_PER_ITEM = 99;

interface AddToCartButtonProps {
  productId: string;
  /** Current stock; the quantity picker never exceeds it. */
  stockQuantity: number;
  className?: string;
}

/**
 * Only render for purchasable products (published, priced, in stock). The server
 * re-validates everything, so this component is purely a UX convenience.
 */
export function AddToCartButton({ productId, stockQuantity, className }: AddToCartButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [quantity, setQuantity] = React.useState(1);
  const max = Math.max(1, Math.min(stockQuantity, MAX_PER_ITEM));

  function handleAdd() {
    startTransition(async () => {
      const result = await addToCartAction(productId, quantity);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("به سبد خرید اضافه شد.", {
        action: {
          label: "مشاهده سبد",
          onClick: () => router.push(routes.cart),
        },
      });
      setQuantity(1);
      router.refresh();
    });
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="تعداد"
          className="inline-flex h-12 items-center rounded-md border bg-background"
        >
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-full rounded-s-md rounded-e-none"
            aria-label="کاهش تعداد"
            disabled={pending || quantity <= 1}
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
          >
            <MinusIcon aria-hidden="true" />
          </Button>
          <output
            aria-live="polite"
            className="min-w-10 text-center text-base font-bold tabular-nums"
          >
            {toPersianDigits(quantity)}
          </output>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-full rounded-s-none rounded-e-md"
            aria-label="افزایش تعداد"
            disabled={pending || quantity >= max}
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
          >
            <PlusIcon aria-hidden="true" />
          </Button>
        </div>

        <Button
          type="button"
          size="lg"
          className="min-w-44 flex-1 sm:flex-none"
          disabled={pending}
          onClick={handleAdd}
        >
          <ShoppingCartIcon aria-hidden="true" />
          {pending ? "در حال افزودن…" : "افزودن به سبد خرید"}
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        <Link href={routes.cart} className="underline-offset-4 hover:underline">
          مشاهده سبد خرید
        </Link>
      </p>
    </div>
  );
}
