"use client";

import { TriangleAlertIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function StoreError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={TriangleAlertIcon}
        title="مشکلی پیش آمد"
        description="بارگذاری این صفحه با خطا روبه‌رو شد. لطفاً دوباره تلاش کنید."
        action={<Button onClick={() => reset()}>تلاش مجدد</Button>}
      />
    </div>
  );
}
