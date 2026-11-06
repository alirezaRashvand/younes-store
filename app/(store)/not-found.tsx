import Link from "next/link";
import { SearchXIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function StoreNotFound() {
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={SearchXIcon}
        title="صفحه مورد نظر پیدا نشد"
        description="ممکن است نشانی را اشتباه وارد کرده باشید یا این صفحه دیگر در دسترس نباشد."
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild>
              <Link href={routes.home}>صفحه اصلی</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={routes.products}>مشاهده محصولات</Link>
            </Button>
          </div>
        }
      />
    </div>
  );
}
