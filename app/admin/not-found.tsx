import Link from "next/link";
import { SearchXIcon } from "lucide-react";
import { routes } from "@/lib/routes";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";

export default function AdminNotFound() {
  return (
    <EmptyState
      icon={SearchXIcon}
      title="مورد درخواستی پیدا نشد"
      description="ممکن است حذف شده باشد یا نشانی اشتباه باشد."
      action={
        <Button asChild>
          <Link href={routes.admin.root}>بازگشت به داشبورد</Link>
        </Button>
      }
    />
  );
}
