"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, SmartphoneIcon } from "lucide-react";
import { toast } from "sonner";

import { fromPersianDigits, toPersianDigits } from "@/lib/format";
import { safeRedirectPath } from "@/lib/safe-redirect";
import { requestOtpAction, verifyOtpAction } from "@/features/auth/actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const OTP_LENGTH = 6;
const RESEND_SECONDS = 60;

interface LoginFormProps {
  /** Requested post-login path (validated again here before use). */
  next?: string | null;
  /** True only when OTP_MODE=development: shows the fixed dev code hint. */
  showDevHint?: boolean;
}

export function LoginForm({ next, showDevHint = false }: LoginFormProps) {
  const router = useRouter();
  const [step, setStep] = React.useState<"phone" | "code">("phone");
  const [phone, setPhone] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, startTransition] = React.useTransition();
  const [resendIn, setResendIn] = React.useState(0);
  const codeInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  React.useEffect(() => {
    if (step === "code") codeInputRef.current?.focus();
  }, [step]);

  function requestCode(event?: React.FormEvent) {
    event?.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await requestOtpAction(phone);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCode("");
      setStep("code");
      setResendIn(RESEND_SECONDS);
      toast.success("کد تأیید ارسال شد.");
    });
  }

  function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await verifyOtpAction(phone, code);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast.success("با موفقیت وارد شدید.");
      router.replace(safeRedirectPath(next, "/"));
      router.refresh();
    });
  }

  function changePhone() {
    setStep("phone");
    setCode("");
    setError(null);
    setResendIn(0);
  }

  if (step === "phone") {
    return (
      <form onSubmit={requestCode} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="login-phone">شماره موبایل</Label>
          <div className="relative">
            <SmartphoneIcon
              className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="login-phone"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              placeholder="۰۹۱۲۳۴۵۶۷۸۹"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={20}
              required
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
              className="h-11 ps-9 text-start tabular-nums"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            کد تأیید به این شماره پیامک می‌شود. اگر حساب نداشته باشید، به‌صورت خودکار ساخته می‌شود.
          </p>
        </div>

        {error ? (
          <Alert variant="destructive" id="login-error">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={pending || phone.trim() === ""}>
          {pending ? "در حال ارسال…" : "دریافت کد تأیید"}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={verifyCode} className="space-y-5" noValidate>
      <div className="space-y-2">
        <Label htmlFor="login-code">کد تأیید</Label>
        <Input
          id="login-code"
          ref={codeInputRef}
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          dir="ltr"
          placeholder={toPersianDigits("------")}
          value={code}
          onChange={(e) =>
            setCode(fromPersianDigits(e.target.value).replace(/\D/g, "").slice(0, OTP_LENGTH))
          }
          maxLength={OTP_LENGTH}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "login-error" : "login-code-hint"}
          className="h-12 text-center text-xl font-bold tracking-[0.5em] tabular-nums"
        />
        <p id="login-code-hint" className="text-xs text-muted-foreground">
          کد {toPersianDigits(OTP_LENGTH)} رقمی ارسال‌شده به{" "}
          <span dir="ltr" className="inline-block tabular-nums">
            {toPersianDigits(fromPersianDigits(phone.trim()))}
          </span>{" "}
          را وارد کنید.
        </p>
      </div>

      {showDevHint ? (
        <Alert variant="info">
          <AlertDescription>
            حالت توسعه فعال است: کد تأیید{" "}
            <span dir="ltr" className="font-bold tabular-nums">
              {toPersianDigits("123456")}
            </span>{" "}
            را وارد کنید. (این پیام فقط در محیط توسعه نمایش داده می‌شود.)
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive" id="login-error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="submit" size="lg" className="w-full" disabled={pending || code.length !== OTP_LENGTH}>
        {pending ? "در حال بررسی…" : "تأیید و ورود"}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <Button type="button" variant="ghost" size="sm" onClick={changePhone} disabled={pending}>
          <ArrowRightIcon aria-hidden="true" />
          ویرایش شماره
        </Button>
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={() => requestCode()}
          disabled={pending || resendIn > 0}
        >
          {resendIn > 0
            ? `ارسال مجدد کد (${toPersianDigits(resendIn)} ثانیه)`
            : "ارسال مجدد کد"}
        </Button>
      </div>
    </form>
  );
}
