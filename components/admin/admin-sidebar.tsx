"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ImagesIcon,
  LayoutDashboardIcon,
  LayersIcon,
  PackageIcon,
  SettingsIcon,
  StoreIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";

interface AdminNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Exact match only (for the dashboard root). */
  exact?: boolean;
}

export const ADMIN_NAV_ITEMS: ReadonlyArray<AdminNavItem> = [
  { href: routes.admin.root, label: "داشبورد", icon: LayoutDashboardIcon, exact: true },
  { href: routes.admin.products, label: "محصولات", icon: PackageIcon },
  { href: routes.admin.categories, label: "دسته‌بندی‌ها", icon: LayersIcon },
  { href: routes.admin.media, label: "رسانه", icon: ImagesIcon },
  { href: routes.admin.settings, label: "تنظیمات", icon: SettingsIcon },
];

function isActive(pathname: string, item: AdminNavItem) {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

interface AdminSidebarProps {
  storeName?: string;
  /** Called after a link is followed (closes the mobile sheet). */
  onNavigate?: () => void;
  className?: string;
}

/** Dark steel navigation rail. Used both as the desktop sidebar and inside the mobile sheet. */
export function AdminSidebar({ storeName = "یونس", onNavigate, className }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar text-sidebar-foreground",
        className,
      )}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-5">
        <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
          <svg viewBox="0 0 24 24" className="size-4.5" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h12M4 17h8" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" />
          </svg>
        </span>
        <div className="leading-tight">
          <p className="text-base font-extrabold">{storeName}</p>
          <p className="text-[0.6875rem] text-sidebar-foreground/60">پنل مدیریت</p>
        </div>
      </div>

      <nav aria-label="منوی مدیریت" className="flex-1 overflow-y-auto p-3">
        <ul className="space-y-1">
          {ADMIN_NAV_ITEMS.map((item) => {
            const active = isActive(pathname, item);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  )}
                >
                  {active ? (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-2 start-0 w-0.5 rounded-full bg-sidebar-primary"
                    />
                  ) : null}
                  <item.icon
                    className={cn("size-4.5", active ? "text-sidebar-primary" : "opacity-80")}
                    aria-hidden="true"
                  />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="shrink-0 border-t border-sidebar-border p-3">
        <Link
          href={routes.home}
          onClick={onNavigate}
          className="flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium text-sidebar-foreground/75 transition-colors outline-none hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground focus-visible:ring-[3px] focus-visible:ring-sidebar-ring/50"
        >
          <StoreIcon className="size-4.5 opacity-80" aria-hidden="true" />
          مشاهده فروشگاه
        </Link>
      </div>
    </div>
  );
}
