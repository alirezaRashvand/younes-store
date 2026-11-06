"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, PlusIcon, SaveIcon, Trash2Icon } from "lucide-react";

import { toPersianDigits } from "@/lib/format";
import {
  updateStoreSettingsAction,
  type StoreSettingsFormPayload,
  type StoreSettingsSaved,
} from "@/features/store-settings/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedImage } from "@/components/admin/image-uploader";

interface SettingsFormProps {
  initial: StoreSettingsSaved;
  uploadsEnabled: boolean;
}

type FieldErrors = Record<string, string[]>;
interface PhoneRow {
  id: string;
  value: string;
}

let rowCounter = 0;
const newRow = (value = ""): PhoneRow => ({ id: `row-${++rowCounter}`, value });

function toRows(values: string[]): PhoneRow[] {
  return values.map((v) => newRow(v));
}

function logoToImages(settings: Pick<StoreSettingsSaved, "logoKey" | "logoUrl">): UploadedImage[] {
  return settings.logoKey && settings.logoUrl
    ? [{ key: settings.logoKey, url: settings.logoUrl, altText: "لوگوی فروشگاه" }]
    : [];
}

interface PhoneListFieldProps {
  legend: string;
  hint: string;
  addLabel: string;
  itemLabel: string;
  placeholder: string;
  rows: PhoneRow[];
  onChange: (rows: PhoneRow[]) => void;
  errors: FieldErrors;
  errorKey: string;
  disabled: boolean;
  max: number;
}

function PhoneListField({
  legend,
  hint,
  addLabel,
  itemLabel,
  placeholder,
  rows,
  onChange,
  errors,
  errorKey,
  disabled,
  max,
}: PhoneListFieldProps) {
  const listError = errors[errorKey]?.[0];
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-semibold">{legend}</legend>
      <p className="-mt-1 text-[0.8125rem] text-muted-foreground">{hint}</p>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          شماره‌ای ثبت نشده است.
        </p>
      ) : (
        <ul className="grid gap-2">
          {rows.map((row, index) => {
            const rowError = errors[`${errorKey}.${index}`]?.[0];
            const inputId = `${errorKey}-${row.id}`;
            return (
              <li key={row.id} className="grid gap-1">
                <div className="flex items-center gap-2">
                  <Input
                    id={inputId}
                    dir="ltr"
                    inputMode="tel"
                    className="text-start"
                    value={row.value}
                    onChange={(event) =>
                      onChange(rows.map((r) => (r.id === row.id ? { ...r, value: event.target.value } : r)))
                    }
                    placeholder={placeholder}
                    aria-label={`${itemLabel} ${toPersianDigits(index + 1)}`}
                    aria-invalid={rowError ? true : undefined}
                    aria-describedby={rowError ? `${inputId}-error` : undefined}
                    disabled={disabled}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
                    aria-label={`حذف ${itemLabel} ${toPersianDigits(index + 1)}`}
                    disabled={disabled}
                  >
                    <Trash2Icon aria-hidden="true" />
                  </Button>
                </div>
                {rowError ? (
                  <p id={`${inputId}-error`} role="alert" className="text-[0.8125rem] font-medium text-destructive">
                    {rowError}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {listError ? (
        <p role="alert" className="text-[0.8125rem] font-medium text-destructive">
          {listError}
        </p>
      ) : null}

      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...rows, newRow()])}
          disabled={disabled || rows.length >= max}
        >
          <PlusIcon aria-hidden="true" />
          {addLabel}
        </Button>
      </div>
    </fieldset>
  );
}

export function SettingsForm({ initial, uploadsEnabled }: SettingsFormProps) {
  const router = useRouter();

  const [saved, setSaved] = React.useState(initial);
  const [storeName, setStoreName] = React.useState(initial.storeName);
  const [logo, setLogo] = React.useState<UploadedImage[]>(() => logoToImages(initial));
  const [mobiles, setMobiles] = React.useState<PhoneRow[]>(() => toRows(initial.mobilePhones));
  const [landlines, setLandlines] = React.useState<PhoneRow[]>(() => toRows(initial.landlinePhones));
  const [address, setAddress] = React.useState(initial.address ?? "");
  const [instagram, setInstagram] = React.useState(initial.instagramUrl ?? "");
  const [telegram, setTelegram] = React.useState(initial.telegramUrl ?? "");
  const [whatsapp, setWhatsapp] = React.useState(initial.whatsappUrl ?? "");
  const [extra, setExtra] = React.useState(initial.additionalDescription ?? "");

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    setErrors({});

    if (!storeName.trim()) {
      setErrors({ storeName: ["نام فروشگاه را وارد کنید."] });
      setFormError("لطفاً خطاهای فرم را برطرف کنید.");
      return;
    }

    const nextLogoKey = logo[0]?.key ?? null;
    const payload: StoreSettingsFormPayload = {
      storeName,
      // Unchanged logo -> don't resend (it may predate the media library).
      logoKey: nextLogoKey === saved.logoKey ? undefined : nextLogoKey,
      mobilePhones: mobiles.map((r) => r.value.trim()).filter(Boolean),
      landlinePhones: landlines.map((r) => r.value.trim()).filter(Boolean),
      address: address.trim() || null,
      instagramUrl: instagram.trim() || null,
      telegramUrl: telegram.trim() || null,
      whatsappUrl: whatsapp.trim() || null,
      additionalDescription: extra.trim() || null,
    };

    setPending(true);
    const result = await updateStoreSettingsAction(payload);
    setPending(false);

    if (!result.ok) {
      // Errors are keyed by the filtered array index; map them back to visible rows.
      setErrors(remapPhoneErrors(result.fieldErrors ?? {}, mobiles, landlines));
      setFormError(result.error);
      toast.error(result.error);
      return;
    }

    const data = result.data;
    setSaved(data);
    setStoreName(data.storeName);
    setMobiles(toRows(data.mobilePhones));
    setLandlines(toRows(data.landlinePhones));
    setLogo(logoToImages(data));
    toast.success("تنظیمات فروشگاه ذخیره شد.");
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-6" aria-busy={pending}>
      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>ذخیره انجام نشد</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>هویت فروشگاه</CardTitle>
          <CardDescription>نام و لوگوی فروشگاه که در سایت نمایش داده می‌شود.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Field label="نام فروشگاه" required error={errors.storeName?.[0]}>
            <FormControl>
              <Input
                value={storeName}
                onChange={(event) => setStoreName(event.target.value)}
                maxLength={100}
                autoComplete="off"
                disabled={pending}
              />
            </FormControl>
          </Field>

          <div className="grid gap-2">
            <span className="text-sm font-semibold">لوگو</span>
            <ImageUploader
              purpose="logo"
              label="لوگو"
              value={logo}
              onChange={setLogo}
              uploadsEnabled={uploadsEnabled}
              max={1}
              disabled={pending}
            />
            {errors.logoKey?.[0] || errors.logoUrl?.[0] ? (
              <p role="alert" className="text-[0.8125rem] font-medium text-destructive">
                {errors.logoKey?.[0] ?? errors.logoUrl?.[0]}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>اطلاعات تماس</CardTitle>
          <CardDescription>شماره‌ها و نشانی که در فوتر و صفحه تماس نمایش داده می‌شود.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <PhoneListField
            legend="شماره‌های موبایل"
            hint="مثال: ۰۹۱۲۳۴۵۶۷۸۹ (حداکثر ۱۰ شماره)"
            addLabel="افزودن موبایل"
            itemLabel="شماره موبایل"
            placeholder="09123456789"
            rows={mobiles}
            onChange={setMobiles}
            errors={errors}
            errorKey="mobilePhones"
            disabled={pending}
            max={10}
          />
          <PhoneListField
            legend="شماره‌های ثابت"
            hint="همراه با کد شهر، مثال: ۰۲۱۱۲۳۴۵۶۷۸ (حداکثر ۱۰ شماره)"
            addLabel="افزودن شماره ثابت"
            itemLabel="شماره ثابت"
            placeholder="02112345678"
            rows={landlines}
            onChange={setLandlines}
            errors={errors}
            errorKey="landlinePhones"
            disabled={pending}
            max={10}
          />
          <Field label="نشانی" error={errors.address?.[0]}>
            <FormControl>
              <Textarea
                value={address}
                onChange={(event) => setAddress(event.target.value)}
                maxLength={500}
                rows={3}
                disabled={pending}
              />
            </FormControl>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>شبکه‌های اجتماعی</CardTitle>
          <CardDescription>نشانی کامل (با https://) صفحه یا کانال فروشگاه.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="اینستاگرام" error={errors.instagramUrl?.[0]}>
            <FormControl>
              <Input
                dir="ltr"
                className="text-start"
                value={instagram}
                onChange={(event) => setInstagram(event.target.value)}
                placeholder="https://instagram.com/…"
                disabled={pending}
              />
            </FormControl>
          </Field>
          <Field label="تلگرام" error={errors.telegramUrl?.[0]}>
            <FormControl>
              <Input
                dir="ltr"
                className="text-start"
                value={telegram}
                onChange={(event) => setTelegram(event.target.value)}
                placeholder="https://t.me/…"
                disabled={pending}
              />
            </FormControl>
          </Field>
          <Field label="واتساپ" error={errors.whatsappUrl?.[0]} className="sm:col-span-2">
            <FormControl>
              <Input
                dir="ltr"
                className="text-start"
                value={whatsapp}
                onChange={(event) => setWhatsapp(event.target.value)}
                placeholder="https://wa.me/98…"
                disabled={pending}
              />
            </FormControl>
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>توضیحات تکمیلی</CardTitle>
          <CardDescription>متن کوتاه درباره فروشگاه، ساعات کاری یا هر نکته دیگر.</CardDescription>
        </CardHeader>
        <CardContent>
          <Field error={errors.additionalDescription?.[0]}>
            <FormControl>
              <Textarea
                value={extra}
                onChange={(event) => setExtra(event.target.value)}
                maxLength={2000}
                rows={5}
                aria-label="توضیحات تکمیلی"
                disabled={pending}
              />
            </FormControl>
          </Field>
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-20 -mx-4 flex items-center gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <SaveIcon aria-hidden="true" />
          )}
          {pending ? "در حال ذخیره…" : "ذخیره تنظیمات"}
        </Button>
      </div>
    </form>
  );
}

/** Server errors index the *filtered* phone arrays; translate to indexes of the visible rows. */
function remapPhoneErrors(
  errors: FieldErrors,
  mobiles: PhoneRow[],
  landlines: PhoneRow[],
): FieldErrors {
  const out: FieldErrors = {};
  const maps = {
    mobilePhones: mobiles.map((r, i) => (r.value.trim() ? i : -1)).filter((i) => i >= 0),
    landlinePhones: landlines.map((r, i) => (r.value.trim() ? i : -1)).filter((i) => i >= 0),
  } as const;

  for (const [key, messages] of Object.entries(errors)) {
    const match = /^(mobilePhones|landlinePhones)\.(\d+)$/.exec(key);
    if (match) {
      const visible = maps[match[1] as keyof typeof maps][Number(match[2])];
      out[`${match[1]}.${visible ?? match[2]}`] = messages;
    } else {
      out[key] = messages;
    }
  }
  return out;
}
