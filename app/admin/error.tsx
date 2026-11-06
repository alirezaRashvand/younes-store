"use client";

import { RotateCcwIcon, TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function AdminError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlertIcon}
      title="مشکلی در بارگذاری این بخش پیش آمد"
      description="لطفاً دوباره تلاش کنید. اگر مشکل ادامه داشت، اتصال پایگاه داده و تنظیمات سرور را بررسی کنید."
      action={
        <Button onClick={reset}>
          <RotateCcwIcon aria-hidden="true" />
          تلاش دوباره
        </Button>
      }
    />
  );
}
