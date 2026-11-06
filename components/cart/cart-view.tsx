"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangleIcon,
  MinusIcon,
  PackageIcon,
  PhoneIcon,
  PlusIcon,
  ShoppingBagIcon,
  Trash2Icon,
} from "lucide-react";
import { toast } from "sonner";

import { routes } from "@/lib/routes";
import { formatToman, toPersianDigits } from "@/lib/format";
import type { CartItemIssue, CartItemView, CartView as CartViewData } from "@/features/cart/service";
import { removeCartItemAction, updateCartItemAction } from "@/features/cart/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

const ISSUE_MESSAGES: Record<CartItemIssue, string> = {
  UNAVAILABLE: "این محصول دیگر در دسترس نیست و در مجموع حساب نمی‌شود.",
  NO_PRICE: "قیمت این محصول مشخص نیست و در مجموع حساب نمی‌شود.",
  OUT_OF_STOCK: "این محصول ناموجود است و در مجموع حساب نمی‌شود.",
  STOCK_REDUCED: "موجودی کمتر از تعداد انتخابی شما است؛ فقط مقدار موجود حساب می‌شود.",
};

interface CartViewProps {
  cart: CartViewData | null;
  /** First store phone number, shown next to the disabled checkout. */
  contactPhone?: string | null;
}

function CartLine({ item, busy, onChange, onRemove }: {
  item: CartItemView;
  busy: boolean;
  onChange: (productId: string, quantity: number) => void;
  onRemove: (productId: string) => void;
}) {
  const unavailable = !item.isPurchasable;
  const displayedQuantity = unavailable ? item.quantity : item.effectiveQuantity;
  const maxQuantity = Math.max(1, Math.min(item.stockQuantity, 99));

  return (
    <li className="flex gap-4 py-5">
      <Link
        href={routes.product(item.slug)}
        className="relative size-20 shrink-0 overflow-hidden rounded-lg border bg-muted/50 sm:size-24"
      >
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt=""
            fill
            sizes="96px"
            unoptimized
            className="object-contain p-1.5"
          />
        ) : (
          <span className="flex size-full items-center justify-center text-muted-foreground/60">
            <PackageIcon className="size-7" aria-hidden="true" />
          </span>
        )}
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-3">
          <Link
            href={routes.product(item.slug)}
            className="line-clamp-2 text-sm leading-6 font-semibold hover:text-primary sm:text-base"
          >
            {item.name}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`حذف ${item.name} از سبد خرید`}
            disabled={busy}
            onClick={() => onRemove(item.productId)}
            className="shrink-0 text-muted-foreground hover:text-destructive"
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>

        {item.issue ? (
          <p className="flex items-start gap-1.5 text-xs leading-5 text-warning-foreground">
            <AlertTriangleIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {ISSUE_MESSAGES[item.issue]}
          </p>
        ) : null}

        <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
          {unavailable ? (
            <span className="text-xs text-muted-foreground">
              تعداد: {toPersianDigits(item.quantity)}
            </span>
          ) : (
            <div
              role="group"
              aria-label={`تعداد ${item.name}`}
              className="inline-flex h-9 items-center rounded-md border bg-background"
            >
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-s-md rounded-e-none"
                aria-label="کاهش تعداد"
                disabled={busy}
                onClick={() => onChange(item.productId, displayedQuantity - 1)}
              >
                <MinusIcon aria-hidden="true" />
              </Button>
              <output className="min-w-8 text-center text-sm font-bold tabular-nums">
                {toPersianDigits(displayedQuantity)}
              </output>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="rounded-s-none rounded-e-md"
                aria-label="افزایش تعداد"
                disabled={busy || displayedQuantity >= maxQuantity}
                onClick={() => onChange(item.productId, displayedQuantity + 1)}
              >
                <PlusIcon aria-hidden="true" />
              </Button>
            </div>
          )}

          <div className="text-end">
            {item.unitPrice !== null && displayedQuantity > 1 && !unavailable ? (
              <p className="text-xs text-muted-foreground tabular-nums">
                {formatToman(item.unitPrice)} × {toPersianDigits(displayedQuantity)}
              </p>
            ) : null}
            <p className="text-base font-extrabold tabular-nums">
              {item.lineTotal !== null ? formatToman(item.lineTotal) : formatToman(null)}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

export function CartView({ cart, contactPhone }: CartViewProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function run(task: () => Promise<{ ok: true } | { ok: false; error: string }>) {
    startTransition(async () => {
      const result = await task();
      if (!result.ok) toast.error(result.error);
      router.refresh();
    });
  }

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBagIcon}
        title="سبد خرید شما خالی است"
        description="محصولات مورد نظرتان را پیدا کنید و به سبد خرید اضافه کنید."
        action={
          <Button asChild>
            <Link href={routes.products}>مشاهده محصولات</Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1fr_22rem]">
      <section aria-label="کالاهای سبد خرید" className="rounded-xl border bg-card px-4 sm:px-5">
        <ul className="divide-y">
          {cart.items.map((item) => (
            <CartLine
              key={item.productId}
              item={item}
              busy={pending}
              onChange={(productId, quantity) =>
                run(() => updateCartItemAction(productId, quantity))
              }
              onRemove={(productId) => run(() => removeCartItemAction(productId))}
            />
          ))}
        </ul>
      </section>

      <aside
        aria-label="خلاصه سفارش"
        className="space-y-4 rounded-xl border bg-card p-5 lg:sticky lg:top-24"
      >
        <h2 className="text-base font-bold">خلاصه سبد خرید</h2>

        <dl className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-muted-foreground">تعداد کالا</dt>
            <dd className="font-semibold tabular-nums">{toPersianDigits(cart.itemCount)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t pt-3">
            <dt className="font-bold">مبلغ کل</dt>
            <dd className="text-lg font-extrabold tabular-nums">{formatToman(cart.total)}</dd>
          </div>
        </dl>

        {cart.hasIssues ? (
          <Alert variant="warning">
            <AlertTriangleIcon aria-hidden="true" />
            <AlertTitle>بررسی سبد خرید</AlertTitle>
            <AlertDescription>
              برخی کالاها تغییر کرده‌اند؛ مبلغ کل فقط بر اساس کالاهای قابل خرید محاسبه شده است.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Button type="button" size="lg" className="w-full" disabled aria-describedby="checkout-note">
            ادامه و ثبت سفارش
          </Button>
          <p id="checkout-note" className="text-xs leading-6 text-muted-foreground">
            ثبت سفارش آنلاین به‌زودی فعال می‌شود. تا آن زمان برای نهایی‌کردن خرید با فروشگاه
            تماس بگیرید.
          </p>
          {contactPhone ? (
            <Button asChild variant="outline" className="w-full">
              <a href={`tel:${contactPhone}`}>
                <PhoneIcon aria-hidden="true" />
                <span dir="ltr" className="tabular-nums">
                  {toPersianDigits(contactPhone)}
                </span>
              </a>
            </Button>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
