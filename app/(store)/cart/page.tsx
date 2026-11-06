import type { Metadata } from "next";

import { getCurrentCartView } from "@/features/cart/current";
import { CartView } from "@/components/cart/cart-view";
import { PageHeader } from "@/components/shared/page-header";
import { getSettingsForChrome } from "@/components/storefront/data";

export const instant = false;

export const metadata: Metadata = {
  title: "سبد خرید",
  robots: { index: false, follow: false },
};

export default async function CartPage() {
  const [cart, settings] = await Promise.all([getCurrentCartView(), getSettingsForChrome()]);
  const contactPhone = settings?.mobilePhones[0] ?? settings?.landlinePhones[0] ?? null;

  return (
    <div className="container-page py-8">
      <PageHeader title="سبد خرید" description="کالاهای انتخابی خود را بررسی و ویرایش کنید." />
      <CartView cart={cart} contactPhone={contactPhone} />
    </div>
  );
}
