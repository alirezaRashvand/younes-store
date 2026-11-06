import Link from "next/link";
import { Suspense } from "react";
import { CameraIcon, MapPinIcon, MessageCircleIcon, PhoneIcon, SendIcon, SmartphoneIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { BrandMark } from "@/components/storefront/brand-mark";
import { DEFAULT_STORE_NAME, getSettingsForChrome } from "@/components/storefront/data";

const linkClass =
  "rounded-sm text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40";

function PhoneLink({ phone, icon: Icon }: { phone: string; icon: typeof PhoneIcon }) {
  return (
    <li>
      <a href={`tel:${phone}`} className={`${linkClass} inline-flex items-center gap-2`}>
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span dir="ltr" className="tabular-nums">
          {toPersianDigits(phone)}
        </span>
      </a>
    </li>
  );
}

async function FooterContent() {
  const settings = await getSettingsForChrome();
  const name = settings?.storeName ?? DEFAULT_STORE_NAME;
  const mobiles = settings?.mobilePhones ?? [];
  const landlines = settings?.landlinePhones ?? [];
  const socials = [
    { href: settings?.instagramUrl, label: "اینستاگرام", icon: CameraIcon },
    { href: settings?.telegramUrl, label: "تلگرام", icon: SendIcon },
    { href: settings?.whatsappUrl, label: "واتساپ", icon: MessageCircleIcon },
  ].filter((s): s is { href: string; label: string; icon: typeof CameraIcon } => Boolean(s.href));
  const year = new Intl.DateTimeFormat("fa-IR", { year: "numeric" }).format(new Date());
  const hasContact = mobiles.length > 0 || landlines.length > 0 || Boolean(settings?.address);

  return (
    <>
      <div className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1.2fr]">
        <div className="space-y-4">
          <BrandMark name={name} logoUrl={settings?.logoUrl} />
          {settings?.additionalDescription ? (
            <p className="max-w-sm text-sm leading-7 whitespace-pre-line text-muted-foreground">
              {settings.additionalDescription}
            </p>
          ) : null}
        </div>

        <nav aria-label="دسترسی سریع" className="space-y-3">
          <h2 className="text-sm font-bold">دسترسی سریع</h2>
          <ul className="space-y-2">
            <li>
              <Link href={routes.products} className={linkClass}>
                همه محصولات
              </Link>
            </li>
            <li>
              <Link href={routes.cart} className={linkClass}>
                سبد خرید
              </Link>
            </li>
            <li>
              <Link href={routes.account} className={linkClass}>
                حساب کاربری
              </Link>
            </li>
          </ul>
        </nav>

        {hasContact || socials.length > 0 ? (
          <div className="space-y-3">
            <h2 className="text-sm font-bold">تماس با ما</h2>
            <ul className="space-y-2">
              {mobiles.map((phone) => (
                <PhoneLink key={phone} phone={phone} icon={SmartphoneIcon} />
              ))}
              {landlines.map((phone) => (
                <PhoneLink key={phone} phone={phone} icon={PhoneIcon} />
              ))}
              {settings?.address ? (
                <li className="flex items-start gap-2 text-sm leading-7 text-muted-foreground">
                  <MapPinIcon className="mt-1.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{settings.address}</span>
                </li>
              ) : null}
            </ul>
            {socials.length > 0 ? (
              <ul className="flex flex-wrap gap-2 pt-1">
                {socials.map(({ href, label, icon: Icon }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-md border bg-background px-2.5 py-1.5 text-xs font-semibold transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40"
                    >
                      <Icon className="size-3.5" aria-hidden="true" />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>
      <Separator />
      <p className="py-5 text-center text-xs text-muted-foreground">
        © {year} {name}. تمامی حقوق محفوظ است.
      </p>
    </>
  );
}

function FooterFallback() {
  return (
    <div className="grid gap-10 py-12 md:grid-cols-[1.4fr_1fr_1.2fr]" aria-hidden="true">
      <Skeleton className="h-9 w-32" />
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-4 w-28" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
    </div>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t bg-muted/40">
      <div className="container-page">
        <Suspense fallback={<FooterFallback />}>
          <FooterContent />
        </Suspense>
      </div>
    </footer>
  );
}
