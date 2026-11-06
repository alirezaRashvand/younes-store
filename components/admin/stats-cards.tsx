import Link from "next/link";
import {
  CheckCircle2Icon,
  LayersIcon,
  PackageIcon,
  PackageXIcon,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { formatCount } from "@/components/admin/admin-utils";
import { Card, CardContent } from "@/components/ui/card";

export interface StatsCardsData {
  totalProducts: number;
  publishedProducts: number;
  outOfStockProducts: number;
  totalCategories: number;
  draftProducts: number;
  lowStockProducts: number;
}

interface StatCardProps {
  label: string;
  value: number;
  hint?: string;
  href: string;
  icon: LucideIcon;
  tone?: "default" | "success" | "danger";
}

const TONES = {
  default: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success",
  danger: "bg-destructive/10 text-destructive",
} as const;

function StatCard({ label, value, hint, href, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <Link
      href={href}
      className="group rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <Card className="h-full transition-shadow group-hover:shadow-md">
        <CardContent className="flex items-start justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-sm font-semibold text-muted-foreground">{label}</p>
            <p className="text-3xl font-extrabold tabular-nums">{formatCount(value)}</p>
            {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
          </div>
          <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-lg", TONES[tone])}>
            <Icon className="size-5" aria-hidden="true" />
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

/** Real catalog counts only: there is no ordering/payment data, so no sales or revenue cards. */
export function StatsCards({ stats }: { stats: StatsCardsData }) {
  return (
    <section aria-label="آمار فروشگاه" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="کل محصولات"
        value={stats.totalProducts}
        hint={`${formatCount(stats.draftProducts)} پیش‌نویس`}
        href={routes.admin.products}
        icon={PackageIcon}
      />
      <StatCard
        label="محصولات منتشرشده"
        value={stats.publishedProducts}
        hint="قابل مشاهده در فروشگاه"
        href={`${routes.admin.products}?status=PUBLISHED`}
        icon={CheckCircle2Icon}
        tone="success"
      />
      <StatCard
        label="محصولات ناموجود"
        value={stats.outOfStockProducts}
        hint={
          stats.lowStockProducts > 0
            ? `${formatCount(stats.lowStockProducts)} محصول کم‌موجودی`
            : undefined
        }
        href={`${routes.admin.products}?stock=out_of_stock`}
        icon={PackageXIcon}
        tone={stats.outOfStockProducts > 0 ? "danger" : "default"}
      />
      <StatCard
        label="دسته‌بندی‌ها"
        value={stats.totalCategories}
        href={routes.admin.categories}
        icon={LayersIcon}
      />
    </section>
  );
}
