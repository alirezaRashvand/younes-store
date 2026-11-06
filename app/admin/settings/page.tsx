import type { Metadata } from "next";

import { isS3Configured } from "@/lib/storage/s3";
import { requireAdminPage } from "@/features/auth/guard";
import { getStoreSettings } from "@/features/store-settings/service";
import { PageHeader } from "@/components/shared/page-header";
import { SettingsForm } from "@/components/admin/settings-form";

export const instant = false;
export const metadata: Metadata = { title: "تنظیمات" };

export default async function AdminSettingsPage() {
  await requireAdminPage();
  const settings = await getStoreSettings();

  return (
    <>
      <PageHeader
        eyebrow="فروشگاه"
        title="تنظیمات"
        description="نام، لوگو و اطلاعات تماس فروشگاه که در سایت نمایش داده می‌شود."
      />
      <SettingsForm
        uploadsEnabled={isS3Configured()}
        initial={{
          storeName: settings.storeName,
          logoKey: settings.logoKey,
          logoUrl: settings.logoUrl,
          mobilePhones: settings.mobilePhones,
          landlinePhones: settings.landlinePhones,
          address: settings.address,
          instagramUrl: settings.instagramUrl,
          telegramUrl: settings.telegramUrl,
          whatsappUrl: settings.whatsappUrl,
          additionalDescription: settings.additionalDescription,
        }}
      />
    </>
  );
}
