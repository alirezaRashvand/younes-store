import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import {
  ArrowLeftIcon,
  CameraIcon,
  LayersIcon,
  MapPinIcon,
  MessageCircleIcon,
  PackageIcon,
  PhoneIcon,
  SendIcon,
  SmartphoneIcon,
} from "lucide-react";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { listCategoryTree } from "@/features/categories/service";
import { listPublishedProducts } from "@/features/products/service";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CategoryCard } from "@/components/categories/category-card";
import { ProductGrid } from "@/components/products/product-grid";
import { EmptyState } from "@/components/shared/empty-state";
import { LoadingGrid } from "@/components/shared/loading-grid";
import { getSettingsForChrome } from "@/components/storefront/data";

const FEATURED_CATEGORY_COUNT = 6;
const LATEST_PRODUCT_COUNT = 8;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSettingsForChrome();
  const name = settings?.storeName ?? "یونس";
  const description =
    settings?.additionalDescription?.trim().slice(0, 160) ||
    "فروشگاه یونس؛ عرضه تجهیزات گرمایشی و سرمایشی با مشخصات دقیق و پشتیبانی تلفنی.";
  return {
    title: { absolute: `${name} | فروشگاه تجهیزات سرمایشی و گرمایشی` },
    description,
    alternates: { canonical: "/" },
    openGraph: { type: "website", locale: "fa_IR", siteName: name, title: name, description },
  };
}

// ── Sections ─────────────────────────────────────────────────────────────

function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="mb-6 flex items-end justify-between gap-4">
      <h2 className="text-xl font-extrabold sm:text-2xl">{title}</h2>
      <Link
        href={href}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-sm text-sm font-semibold text-primary outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        {linkLabel}
        <ArrowLeftIcon className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}

async function FeaturedCategories() {
  await connection();
  const roots = (await listCategoryTree()).slice(0, FEATURED_CATEGORY_COUNT);

  return (
    <section aria-labelledby="featured-categories" className="container-page py-10">
      <div id="featured-categories">
        <SectionHeading title="دسته‌بندی‌ها" href={routes.categories} linkLabel="همه دسته‌بندی‌ها" />
      </div>
      {roots.length === 0 ? (
        <EmptyState
          icon={LayersIcon}
          title="هنوز دسته‌بندی‌ای ثبت نشده است"
          description="به‌زودی دسته‌بندی محصولات در این بخش نمایش داده می‌شود."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roots.map((category) => (
            <li key={category.id}>
              <CategoryCard category={category} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FeaturedCategoriesFallback() {
  return (
    <div className="container-page py-10" aria-hidden="true">
      <Skeleton className="mb-6 h-8 w-40" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

async function LatestProducts() {
  await connection();
  const { items } = await listPublishedProducts({
    page: 1,
    pageSize: LATEST_PRODUCT_COUNT,
    sortBy: "createdAt",
    sortDir: "desc",
  });

  return (
    <section aria-labelledby="latest-products" className="container-page py-10">
      <div id="latest-products">
        <SectionHeading title="تازه‌ترین محصولات" href={routes.products} linkLabel="همه محصولات" />
      </div>
      {items.length === 0 ? (
        <EmptyState
          icon={PackageIcon}
          title="هنوز محصولی منتشر نشده است"
          description="به‌محض انتشار، محصولات فروشگاه در این بخش نمایش داده می‌شوند."
        />
      ) : (
        <ProductGrid products={items} priorityCount={0} />
      )}
    </section>
  );
}

async function ContactStrip() {
  const settings = await getSettingsForChrome();
  if (!settings) return null;

  const mobiles = settings.mobilePhones;
  const landlines = settings.landlinePhones;
  const socials = [
    { href: settings.instagramUrl, label: "اینستاگرام", icon: CameraIcon },
    { href: settings.telegramUrl, label: "تلگرام", icon: SendIcon },
    { href: settings.whatsappUrl, label: "واتساپ", icon: MessageCircleIcon },
  ].filter((s): s is { href: string; label: string; icon: typeof CameraIcon } => Boolean(s.href));

  if (mobiles.length + landlines.length === 0 && !settings.address && socials.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="contact-strip" className="container-page py-10">
      <div className="flex flex-col gap-6 rounded-2xl border bg-card p-6 sm:p-8 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h2 id="contact-strip" className="text-lg font-extrabold">
            برای قیمت و راهنمایی تماس بگیرید
          </h2>
          {settings.address ? (
            <p className="flex items-start gap-2 text-sm leading-7 text-muted-foreground">
              <MapPinIcon className="mt-1.5 size-4 shrink-0" aria-hidden="true" />
              {settings.address}
            </p>
          ) : null}
        </div>

        <ul className="flex flex-wrap items-center gap-2">
          {mobiles.map((phone) => (
            <li key={phone}>
              <Button asChild variant="outline">
                <a href={`tel:${phone}`}>
                  <SmartphoneIcon aria-hidden="true" />
                  <span dir="ltr" className="tabular-nums">
                    {toPersianDigits(phone)}
                  </span>
                </a>
              </Button>
            </li>
          ))}
          {landlines.map((phone) => (
            <li key={phone}>
              <Button asChild variant="outline">
                <a href={`tel:${phone}`}>
                  <PhoneIcon aria-hidden="true" />
                  <span dir="ltr" className="tabular-nums">
                    {toPersianDigits(phone)}
                  </span>
                </a>
              </Button>
            </li>
          ))}
          {socials.map(({ href, label, icon: Icon }) => (
            <li key={label}>
              <Button asChild variant="ghost">
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <Icon aria-hidden="true" />
                  {label}
                </a>
              </Button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <>
      <section aria-labelledby="hero-title" className="bg-grid-fine relative overflow-hidden border-b">
        <div className="container-page py-16 sm:py-24">
          <div className="max-w-3xl space-y-6">
            <p
              id="hero-title"
              className="text-[clamp(4.5rem,16vw,9rem)] leading-none font-extrabold tracking-tight text-primary"
            >
              یونس
            </p>
            <h1 className="text-2xl font-extrabold sm:text-4xl">
              تجهیزات گرمایشی و سرمایشی، با مشخصات دقیق
            </h1>
            <p className="max-w-xl text-base leading-8 text-muted-foreground sm:text-lg">
              پکیج، کولر گازی و ابزارآلات برودتی؛ برای قیمت و راهنمایی خرید مستقیم با ما در تماس باشید.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button asChild size="lg">
                <Link href={routes.products}>مشاهده محصولات</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href={routes.categories}>دسته‌بندی‌ها</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={<FeaturedCategoriesFallback />}>
        <FeaturedCategories />
      </Suspense>

      <Suspense
        fallback={
          <div className="container-page py-10">
            <LoadingGrid count={4} />
          </div>
        }
      >
        <LatestProducts />
      </Suspense>

      <Suspense fallback={null}>
        <ContactStrip />
      </Suspense>
    </>
  );
}
