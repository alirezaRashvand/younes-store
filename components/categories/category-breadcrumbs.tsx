import Link from "next/link";
import { HomeIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

interface CategoryBreadcrumbsProps {
  /** Ancestors ordered root → current (as returned by getCategoryPath). */
  path: ReadonlyArray<{ id: string; name: string; slug: string }>;
  /** Extra trailing crumb, e.g. a product name. If set, the whole path is linked. */
  trailing?: string;
  className?: string;
}

export function CategoryBreadcrumbs({ path, trailing, className }: CategoryBreadcrumbsProps) {
  return (
    <Breadcrumb className={className}>
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={routes.home} className="inline-flex items-center gap-1.5">
              <HomeIcon className="size-3.5" aria-hidden="true" />
              خانه
            </Link>
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink asChild>
            <Link href={routes.products}>محصولات</Link>
          </BreadcrumbLink>
        </BreadcrumbItem>

        {path.map((category, i) => {
          const isLast = i === path.length - 1 && !trailing;
          return (
            <span key={category.id} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{category.name}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={routes.category(category.slug)}>{category.name}</Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          );
        })}

        {trailing ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="line-clamp-1 max-w-[16rem]">{trailing}</BreadcrumbPage>
            </BreadcrumbItem>
          </>
        ) : null}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
