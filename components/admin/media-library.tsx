"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckIcon, CopyIcon, ImagesIcon, Trash2Icon, TriangleAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import { deleteMediaAction } from "@/features/media/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/empty-state";
import {
  PURPOSE_LABELS,
  formatBytes,
  formatDate,
} from "@/components/admin/admin-utils";

export interface MediaLibraryUsage {
  type: "product" | "category" | "logo" | "editor";
  name: string;
  id?: string;
}

export interface MediaLibraryItem {
  id: string;
  url: string;
  mimeType: string;
  sizeBytes: number;
  purpose: string;
  /** ISO string */
  createdAt: string;
  verified: boolean;
  usages: MediaLibraryUsage[];
}

interface MediaLibraryProps {
  items: MediaLibraryItem[];
  total: number;
  /** Currently selected purpose filter ("" = all). */
  purpose: string;
  /** S3 configured: deleting needs the bucket, so it is disabled otherwise. */
  storageConfigured: boolean;
}

const FILTERS = [
  { value: "", label: "همه" },
  { value: "product", label: PURPOSE_LABELS.product! },
  { value: "category", label: PURPOSE_LABELS.category! },
  { value: "logo", label: PURPOSE_LABELS.logo! },
  { value: "editor", label: PURPOSE_LABELS.editor! },
] as const;

const USAGE_LABEL: Record<MediaLibraryUsage["type"], string> = {
  product: "محصول",
  editor: "توضیحات محصول",
  category: "دسته‌بندی",
  logo: "لوگوی فروشگاه",
};

function usageHref(usage: MediaLibraryUsage): string {
  if ((usage.type === "product" || usage.type === "editor") && usage.id) {
    return routes.admin.productEdit(usage.id);
  }
  if (usage.type === "category") return routes.admin.categories;
  return routes.admin.settings;
}

function CopyUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("نشانی تصویر کپی شد.");
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("کپی انجام نشد. نشانی را به‌صورت دستی کپی کنید.");
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={copy}>
      {copied ? <CheckIcon aria-hidden="true" /> : <CopyIcon aria-hidden="true" />}
      {copied ? "کپی شد" : "کپی نشانی"}
    </Button>
  );
}

function MediaCard({
  item,
  storageConfigured,
}: {
  item: MediaLibraryItem;
  storageConfigured: boolean;
}) {
  const router = useRouter();
  const inUse = item.usages.length > 0;
  const purposeLabel = PURPOSE_LABELS[item.purpose] ?? item.purpose;
  const canDelete = !inUse && storageConfigured;

  async function handleDelete() {
    const result = await deleteMediaAction(item.id);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("فایل حذف شد.");
    router.refresh();
  }

  return (
    <li>
      <Card className="h-full gap-3 overflow-hidden py-0">
        <div className="relative aspect-square bg-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={item.url}
            alt={`${purposeLabel} بارگذاری‌شده در ${formatDate(item.createdAt)}`}
            loading="lazy"
            className="size-full object-cover"
          />
          <Badge className="absolute start-2 top-2" variant="secondary">
            {purposeLabel}
          </Badge>
        </div>

        <CardContent className="flex flex-1 flex-col gap-3 px-4 pb-4">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
            <dt className="text-muted-foreground">حجم</dt>
            <dd className="text-end font-semibold tabular-nums">{formatBytes(item.sizeBytes)}</dd>
            <dt className="text-muted-foreground">نوع</dt>
            <dd dir="ltr" className="text-end font-semibold">{item.mimeType}</dd>
            <dt className="text-muted-foreground">تاریخ</dt>
            <dd className="text-end font-semibold">{formatDate(item.createdAt)}</dd>
          </dl>

          <div className="flex flex-wrap gap-1.5">
            <Badge variant={item.verified ? "success" : "warning"}>
              {item.verified ? "تأییدشده" : "تأییدنشده"}
            </Badge>
            <Badge variant={inUse ? "info" : "muted"}>{inUse ? "در حال استفاده" : "بدون استفاده"}</Badge>
          </div>

          {inUse ? (
            <div className="space-y-1 text-xs text-muted-foreground">
              <p>برای حذف، ابتدا این تصویر را از موارد زیر بردارید:</p>
              <ul className="space-y-0.5">
                {item.usages.slice(0, 4).map((usage, index) => (
                  <li key={`${usage.type}-${usage.id ?? index}`}>
                    <Link
                      href={usageHref(usage)}
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                    >
                      {USAGE_LABEL[usage.type]}: {usage.name}
                    </Link>
                  </li>
                ))}
                {item.usages.length > 4 ? (
                  <li>و {item.usages.length - 4} مورد دیگر…</li>
                ) : null}
              </ul>
            </div>
          ) : !storageConfigured ? (
            <p className="text-xs text-muted-foreground">
              حذف فایل نیازمند پیکربندی ذخیره‌سازی S3 است.
            </p>
          ) : null}

          <div className="mt-auto flex flex-wrap gap-2 pt-1">
            <CopyUrlButton url={item.url} />
            <ConfirmDialog
              destructive
              title="حذف این فایل؟"
              description="فایل برای همیشه از فضای ذخیره‌سازی و کتابخانه رسانه حذف می‌شود. این کار قابل بازگشت نیست."
              confirmLabel="حذف فایل"
              onConfirm={handleDelete}
              trigger={
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={!canDelete}
                  className={cn(canDelete && "text-destructive hover:bg-destructive/10 hover:text-destructive")}
                  aria-label={
                    inUse
                      ? "حذف غیرفعال است: فایل در حال استفاده است"
                      : "حذف فایل"
                  }
                >
                  <Trash2Icon aria-hidden="true" />
                  حذف
                </Button>
              }
            />
          </div>
        </CardContent>
      </Card>
    </li>
  );
}

export function MediaLibrary({ items, total, purpose, storageConfigured }: MediaLibraryProps) {
  return (
    <div className="space-y-5">
      {!storageConfigured ? (
        <Alert variant="warning" role="status">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertDescription>
            ذخیره‌سازی S3 پیکربندی نشده است؛ بارگذاری و حذف فایل غیرفعال است. فایل‌های ثبت‌شده در پایگاه داده همچنان نمایش داده می‌شوند.
          </AlertDescription>
        </Alert>
      ) : null}

      <nav aria-label="فیلتر نوع رسانه" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = purpose === filter.value;
          return (
            <Link
              key={filter.value || "all"}
              href={filter.value ? `${routes.admin.media}?purpose=${filter.value}` : routes.admin.media}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center rounded-full border px-4 text-sm font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "bg-background hover:bg-accent",
              )}
            >
              {filter.label}
            </Link>
          );
        })}
      </nav>

      {items.length === 0 ? (
        <EmptyState
          icon={ImagesIcon}
          title="فایلی در کتابخانه نیست"
          description={
            total === 0 && !purpose
              ? "تصاویری که برای محصولات، دسته‌بندی‌ها یا لوگو بارگذاری کنید اینجا فهرست می‌شوند."
              : "برای این فیلتر فایلی پیدا نشد."
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((item) => (
            <MediaCard key={item.id} item={item} storageConfigured={storageConfigured} />
          ))}
        </ul>
      )}
    </div>
  );
}
