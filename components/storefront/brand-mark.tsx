import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

interface BrandMarkProps {
  name: string;
  logoUrl?: string | null;
  className?: string;
  onNavigate?: () => void;
}

/** Louvre-style glyph used when the store has no uploaded logo. */
function Glyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path d="M4 7h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 12h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M4 17h8" stroke="var(--brand-ice)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function BrandMark({ name, logoUrl, className, onNavigate }: BrandMarkProps) {
  return (
    <Link
      href={routes.home}
      onClick={onNavigate}
      aria-label={`${name} - صفحه اصلی`}
      className={cn(
        "inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
        className,
      )}
    >
      {logoUrl ? (
        <span className="relative size-9 shrink-0 overflow-hidden rounded-md">
          <Image src={logoUrl} alt="" fill sizes="36px" unoptimized className="object-contain" />
        </span>
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Glyph />
        </span>
      )}
      <span className="text-xl font-extrabold tracking-tight text-foreground">{name}</span>
    </Link>
  );
}
