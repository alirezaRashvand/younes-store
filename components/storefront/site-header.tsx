import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { Skeleton } from "@/components/ui/skeleton";
import { listCategoryTree } from "@/features/categories/service";
import { AccountMenu, AccountMenuFallback } from "@/components/storefront/account-menu";
import { BrandMark } from "@/components/storefront/brand-mark";
import { CartIndicator, CartIndicatorFallback } from "@/components/storefront/cart-indicator";
import { DEFAULT_STORE_NAME, getSettingsForChrome } from "@/components/storefront/data";
import { MobileNav, MobileNavTrigger } from "@/components/storefront/mobile-nav";
import { SearchBox } from "@/components/storefront/search-box";

const NAV_LINKS = [
  { href: routes.products, label: "محصولات" },
] as const;

/** Brand with the uploaded logo / name; static «یونس» until settings stream in. */
async function StoreBrand() {
  const settings = await getSettingsForChrome();
  return (
    <BrandMark
      name={settings?.storeName ?? DEFAULT_STORE_NAME}
      logoUrl={settings?.logoUrl}
    />
  );
}

async function MobileNavLoader() {
  await connection();
  const [settings, categories] = await Promise.all([
    getSettingsForChrome(),
    listCategoryTree().catch((error) => {
      console.error("[storefront] failed to load categories", error);
      return [];
    }),
  ]);
  return (
    <MobileNav
      storeName={settings?.storeName ?? DEFAULT_STORE_NAME}
      logoUrl={settings?.logoUrl}
      categories={categories}
      phone={settings?.mobilePhones[0] ?? settings?.landlinePhones[0] ?? null}
    />
  );
}

function SearchSlot({ className }: { className?: string }) {
  return (
    <Suspense fallback={<Skeleton className={cn("h-10 w-full", className)} />}>
      <SearchBox className={className} />
    </Suspense>
  );
}

/**
 * Server shell: static structure prerenders; anything that reads cookies or the
 * database streams in behind its own <Suspense> boundary.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
      <div className="container-page flex h-16 items-center gap-2 sm:gap-4">
        <Suspense fallback={<MobileNavTrigger />}>
          <MobileNavLoader />
        </Suspense>

        <Suspense fallback={<BrandMark name={DEFAULT_STORE_NAME} />}>
          <StoreBrand />
        </Suspense>

        <nav aria-label="ناوبری اصلی" className="ms-4 hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm font-semibold text-foreground/80 transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="mx-auto hidden w-full max-w-md md:block">
          <SearchSlot />
        </div>

        <div className="ms-auto flex items-center gap-1 md:ms-0">
          <Suspense fallback={<CartIndicatorFallback />}>
            <CartIndicator />
          </Suspense>
          <Suspense fallback={<AccountMenuFallback />}>
            <AccountMenu />
          </Suspense>
        </div>
      </div>

      <div className="container-page pb-3 md:hidden">
        <SearchSlot />
      </div>
    </header>
  );
}
