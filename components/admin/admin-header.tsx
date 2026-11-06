"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDownIcon, ExternalLinkIcon, LogOutIcon, MenuIcon, UserRoundIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { logoutAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AdminSidebar } from "@/components/admin/admin-sidebar";

interface AdminHeaderProps {
  user: { name: string | null; phoneNumber: string };
  storeName?: string;
}

export function AdminHeader({ user, storeName }: AdminHeaderProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  function handleLogout() {
    startTransition(async () => {
      const result = await logoutAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.push(routes.login);
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur-md sm:px-6">
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="باز کردن منوی مدیریت">
            <MenuIcon aria-hidden="true" />
          </Button>
        </SheetTrigger>
        <SheetContent side="start" showCloseButton={false} className="gap-0 border-sidebar-border p-0">
          <SheetTitle className="sr-only">منوی مدیریت</SheetTitle>
          <SheetDescription className="sr-only">پیوندهای بخش‌های پنل مدیریت</SheetDescription>
          <AdminSidebar storeName={storeName} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="ms-auto flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link href={routes.home} target="_blank" rel="noopener">
            <ExternalLinkIcon aria-hidden="true" />
            مشاهده فروشگاه
          </Link>
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2" aria-label="منوی کاربر">
              <UserRoundIcon aria-hidden="true" />
              <span className="max-w-32 truncate">{user.name || "مدیر"}</span>
              <ChevronDownIcon className="opacity-60" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="space-y-0.5">
              <span className="block text-sm font-bold text-foreground">{user.name || "مدیر فروشگاه"}</span>
              <span dir="ltr" className="block text-start text-xs font-normal tabular-nums">
                {toPersianDigits(user.phoneNumber)}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={pending}
              onSelect={(event) => {
                event.preventDefault();
                handleLogout();
              }}
            >
              <LogOutIcon aria-hidden="true" />
              {pending ? "در حال خروج…" : "خروج از حساب"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
