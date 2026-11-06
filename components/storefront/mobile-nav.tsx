"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MenuIcon, PhoneIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import type { CategoryNode } from "@/features/categories/tree";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { BrandMark } from "@/components/storefront/brand-mark";
import { CategoryTreeNav } from "@/components/categories/category-tree-nav";
import { SearchBox } from "@/components/storefront/search-box";

interface MobileNavProps {
  storeName: string;
  logoUrl?: string | null;
  categories: ReadonlyArray<CategoryNode>;
  phone?: string | null;
}

export function MobileNavTrigger() {
  return (
    <Button variant="ghost" size="icon" className="md:hidden" aria-label="باز کردن منو" disabled>
      <MenuIcon aria-hidden="true" />
    </Button>
  );
}

export function MobileNav({ storeName, logoUrl, categories, phone }: MobileNavProps) {
  const [open, setOpen] = React.useState(false);
  const pathname = usePathname();
  const close = React.useCallback(() => setOpen(false), []);

  const activeSlug = React.useMemo(() => {
    const prefix = "/categories/";
    if (!pathname.startsWith(prefix)) return null;
    try {
      return decodeURIComponent(pathname.slice(prefix.length).split("/")[0] ?? "");
    } catch {
      return null;
    }
  }, [pathname]);

  const links = [
    { href: routes.home, label: "خانه" },
    { href: routes.products, label: "همه محصولات" },
    { href: routes.cart, label: "سبد خرید" },
  ];

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="باز کردن منو">
          <MenuIcon aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="start" className="gap-0 p-0">
        <SheetHeader className="border-b p-4">
          <SheetTitle className="sr-only">{storeName}</SheetTitle>
          <BrandMark name={storeName} logoUrl={logoUrl} onNavigate={close} className="w-fit" />
          <SheetDescription className="sr-only">منوی اصلی فروشگاه</SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <SearchBox onSearch={close} />

          <nav aria-label="پیوندهای اصلی">
            <ul className="space-y-0.5">
              {links.map((link) => {
                const active = pathname === link.href;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      onClick={close}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "block rounded-md px-3 py-2 text-sm font-semibold outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/40",
                        active && "bg-accent text-accent-foreground",
                      )}
                    >
                      {link.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {categories.length > 0 ? (
            <>
              <Separator />
              <div className="space-y-2">
                <p className="text-eyebrow px-3">دسته‌بندی‌ها</p>
                <CategoryTreeNav tree={categories} activeSlug={activeSlug} onNavigate={close} />
              </div>
            </>
          ) : null}
        </div>

        {phone ? (
          <div className="border-t p-4">
            <a
              href={`tel:${phone}`}
              className="flex items-center gap-2 rounded-md text-sm font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <PhoneIcon className="size-4 text-primary" aria-hidden="true" />
              <span className="text-muted-foreground">تماس با فروشگاه:</span>
              <span dir="ltr" className="tabular-nums">
                {toPersianDigits(phone)}
              </span>
            </a>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
