"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  LayoutDashboardIcon,
  LogOutIcon,
  UserRoundIcon,
} from "lucide-react";

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

interface AccountMenuClientProps {
  name: string | null;
  phoneNumber: string;
  isAdmin: boolean;
}

export function AccountMenuClient({ name, phoneNumber, isAdmin }: AccountMenuClientProps) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  function handleLogout() {
    startTransition(async () => {
      const result = await logoutAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("با موفقیت از حساب خود خارج شدید.");
      router.push(routes.home);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2" aria-label="منوی حساب کاربری">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <UserRoundIcon className="size-3.5" aria-hidden="true" />
          </span>
          <span className="hidden max-w-28 truncate sm:inline">{name || "حساب من"}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block text-sm font-bold text-foreground">{name || "کاربر یونس"}</span>
          <span dir="ltr" className="block text-start text-xs font-normal tabular-nums">
            {toPersianDigits(phoneNumber)}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={routes.account}>
            <UserRoundIcon aria-hidden="true" />
            حساب کاربری
          </Link>
        </DropdownMenuItem>
        {isAdmin ? (
          <DropdownMenuItem asChild>
            <Link href={routes.admin.root}>
              <LayoutDashboardIcon aria-hidden="true" />
              پنل مدیریت
            </Link>
          </DropdownMenuItem>
        ) : null}
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
  );
}
