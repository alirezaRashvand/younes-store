import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { routes } from "@/lib/routes";

interface AdminBreadcrumbProps {
  items: Array<{ label: string; href?: string }>;
}

/** Simple admin trail: داشبورد › ... › current page. */
export function AdminBreadcrumb({ items }: AdminBreadcrumbProps) {
  const trail = [{ label: "داشبورد", href: routes.admin.root }, ...items];
  return (
    <nav aria-label="مسیر صفحه">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        {trail.map((item, index) => {
          const last = index === trail.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !last ? (
                <Link href={item.href} className="hover:text-foreground hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={last ? "max-w-60 truncate font-semibold text-foreground" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!last ? <ChevronLeftIcon className="size-3.5" aria-hidden="true" /> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
