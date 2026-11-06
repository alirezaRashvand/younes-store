import type { Metadata } from "next";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { isS3Configured } from "@/lib/storage/s3";
import { requireAdminPage } from "@/features/auth/guard";
import { listMediaAssets } from "@/features/media/service";
import { PageHeader } from "@/components/shared/page-header";
import { PaginationControls } from "@/components/shared/pagination-controls";
import { MediaLibrary, type MediaLibraryItem } from "@/components/admin/media-library";

export const instant = false;
export const metadata: Metadata = { title: "رسانه" };

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

export default async function AdminMediaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const admin = await requireAdminPage();
  const raw = await searchParams;

  const result = await listMediaAssets(admin, {
    page: first(raw.page) || 1,
    purpose: first(raw.purpose) || undefined,
  });
  // The service validates the purpose; mirror its decision for the filter UI.
  const purpose = ["product", "category", "logo", "editor"].includes(first(raw.purpose))
    ? first(raw.purpose)
    : "";

  const items: MediaLibraryItem[] = result.items.map((item) => ({
    id: item.id,
    url: item.url,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    purpose: item.purpose,
    createdAt: item.createdAt.toISOString(),
    verified: item.verifiedAt !== null,
    usages: item.usages,
  }));

  return (
    <>
      <PageHeader
        eyebrow="فایل‌ها"
        title="رسانه"
        description={`${toPersianDigits(result.total)} فایل ثبت‌شده. فقط فایل‌های بدون استفاده قابل حذف هستند.`}
      />
      <div className="space-y-4">
        <MediaLibrary
          items={items}
          total={result.total}
          purpose={purpose}
          storageConfigured={isS3Configured()}
        />
        <PaginationControls
          page={result.page}
          totalPages={result.totalPages}
          basePath={routes.admin.media}
          searchParams={purpose ? { purpose } : {}}
          className="pt-2"
        />
      </div>
    </>
  );
}
