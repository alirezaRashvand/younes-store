import Link from "next/link";
import type { Metadata } from "next";
import { ImageOffIcon, LayersIcon, PackageIcon, PlusIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { formatToman } from "@/lib/format";
import { requireAdminPage } from "@/features/auth/guard";
import { getDashboardStats } from "@/features/admin/stats";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { StatsCards } from "@/components/admin/stats-cards";
import {
  STATUS_BADGE_VARIANT,
  STATUS_LABELS,
  formatCount,
  formatDate,
} from "@/components/admin/admin-utils";

export const instant = false;
export const metadata: Metadata = { title: "داشبورد" };

export default async function AdminDashboardPage() {
  const admin = await requireAdminPage();
  const stats = await getDashboardStats(admin);

  return (
    <>
      <PageHeader
        eyebrow="پنل مدیریت"
        title="داشبورد"
        description="نمای کلی کاتالوگ فروشگاه بر اساس اطلاعات واقعی ثبت‌شده."
        actions={
          <>
            <Button asChild>
              <Link href={routes.admin.productNew}>
                <PlusIcon aria-hidden="true" />
                محصول جدید
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={routes.admin.categories}>
                <LayersIcon aria-hidden="true" />
                دسته‌بندی‌ها
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-6">
        <StatsCards stats={stats} />

        <Card>
          <CardHeader>
            <CardTitle>جدیدترین محصولات</CardTitle>
            <CardDescription>آخرین محصولاتی که به فروشگاه افزوده شده‌اند.</CardDescription>
          </CardHeader>
          <CardContent>
            {stats.recentProducts.length === 0 ? (
              <EmptyState
                icon={PackageIcon}
                title="هنوز محصولی ثبت نشده است"
                description="اولین محصول را اضافه کنید تا اینجا نمایش داده شود."
                action={
                  <Button asChild>
                    <Link href={routes.admin.productNew}>
                      <PlusIcon aria-hidden="true" />
                      افزودن محصول
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y">
                {stats.recentProducts.map((product) => {
                  const thumb = product.images[0];
                  return (
                    <li key={product.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={thumb.url} alt="" loading="lazy" className="size-full object-cover" />
                        ) : (
                          <ImageOffIcon className="size-4 text-muted-foreground" aria-label="بدون تصویر" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link
                          href={routes.admin.productEdit(product.id)}
                          className="block truncate font-semibold hover:text-primary hover:underline"
                        >
                          {product.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {product.price === null ? "بدون قیمت" : formatToman(product.price)}
                          {" · "}
                          {product.stockQuantity > 0
                            ? `موجودی ${formatCount(product.stockQuantity)}`
                            : "ناموجود"}
                          {" · "}
                          {formatDate(product.createdAt)}
                        </p>
                      </div>
                      <Badge variant={STATUS_BADGE_VARIANT[product.status]}>
                        {STATUS_LABELS[product.status]}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
