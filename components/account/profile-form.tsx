"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOutIcon } from "lucide-react";
import { toast } from "sonner";

import { routes } from "@/lib/routes";
import { toPersianDigits } from "@/lib/format";
import { logoutAction, updateProfileAction } from "@/features/auth/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface ProfileFormProps {
  phoneNumber: string;
  name: string | null;
  /** Only customers may edit their name through the public action. */
  canEditName?: boolean;
}

export function ProfileForm({ phoneNumber, name, canEditName = true }: ProfileFormProps) {
  const router = useRouter();
  const [value, setValue] = React.useState(name ?? "");
  const [savedName, setSavedName] = React.useState(name ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, startSave] = React.useTransition();
  const [loggingOut, startLogout] = React.useTransition();

  const dirty = value.trim() !== savedName.trim();

  function handleSave(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startSave(async () => {
      const result = await updateProfileAction(value);
      if (!result.ok) {
        setError(result.fieldErrors?.name?.[0] ?? result.error);
        return;
      }
      setSavedName(result.data.name);
      setValue(result.data.name);
      toast.success("نام شما ذخیره شد.");
      router.refresh();
    });
  }

  function handleLogout() {
    startLogout(async () => {
      const result = await logoutAction();
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("با موفقیت از حساب خود خارج شدید.");
      router.replace(routes.home);
      router.refresh();
    });
  }

  return (
    <div className="space-y-8">
      <form onSubmit={handleSave} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="profile-phone">شماره موبایل</Label>
          <Input
            id="profile-phone"
            value={toPersianDigits(phoneNumber)}
            dir="ltr"
            readOnly
            disabled
            className="text-start tabular-nums"
          />
          <p className="text-xs text-muted-foreground">شماره موبایل قابل تغییر نیست.</p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="profile-name">نام و نام خانوادگی</Label>
          <Input
            id="profile-name"
            name="name"
            autoComplete="name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
            disabled={!canEditName || saving}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "profile-name-error" : undefined}
          />
          {error ? (
            <p id="profile-name-error" role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        {canEditName ? (
          <Button type="submit" disabled={saving || !dirty || value.trim() === ""}>
            {saving ? "در حال ذخیره…" : "ذخیره تغییرات"}
          </Button>
        ) : null}
      </form>

      <div className="border-t pt-6">
        <Button type="button" variant="outline" onClick={handleLogout} disabled={loggingOut}>
          <LogOutIcon aria-hidden="true" />
          {loggingOut ? "در حال خروج…" : "خروج از حساب"}
        </Button>
      </div>
    </div>
  );
}
