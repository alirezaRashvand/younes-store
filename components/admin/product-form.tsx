"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2Icon, SaveIcon, SearchIcon, XIcon } from "lucide-react";

import { routes } from "@/lib/routes";
import { formatToman, fromPersianDigits, slugifyPersian, toPersianDigits } from "@/lib/format";
import { MAX_PRODUCT_IMAGES } from "@/features/products/constants";
import { createProductAction, updateProductAction } from "@/features/products/actions";
import type { ProductFormPayload } from "@/features/products/form-types";
import type { CategoryOption } from "@/features/categories/options";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ImageUploader, type UploadedImage } from "@/components/admin/image-uploader";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { STATUS_LABELS } from "@/components/admin/admin-utils";

export interface ProductFormInitialValues {
  id?: string;
  name: string;
  slug: string;
  /** Toman digits only, "" when the product has no price. */
  price: string;
  stockQuantity: string;
  status: ProductFormPayload["status"];
  categoryIds: string[];
  /** Tiptap JSON document or null. */
  description: unknown;
  images: UploadedImage[];
}

interface ProductFormProps {
  mode: "create" | "edit";
  initial: ProductFormInitialValues;
  categoryOptions: CategoryOption[];
  uploadsEnabled: boolean;
}

type FieldErrors = Record<string, string[]>;

function firstError(errors: FieldErrors, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const direct = errors[key]?.[0];
    if (direct) return direct;
  }
  return undefined;
}

function firstErrorWithPrefix(errors: FieldErrors, prefix: string): string | undefined {
  const key = Object.keys(errors).find((k) => k === prefix || k.startsWith(`${prefix}.`));
  return key ? errors[key]?.[0] : undefined;
}

function pricePreview(raw: string): string | null {
  const cleaned = fromPersianDigits(raw).replace(/[,٬،\s]/g, "");
  if (!/^\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? formatToman(n) : null;
}

export function ProductForm({ mode, initial, categoryOptions, uploadsEnabled }: ProductFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  const [name, setName] = React.useState(initial.name);
  const [slug, setSlug] = React.useState(initial.slug);
  // Create mode: slug follows the name until the admin edits it by hand.
  const [slugTouched, setSlugTouched] = React.useState(isEdit);
  const [price, setPrice] = React.useState(initial.price);
  const [stock, setStock] = React.useState(initial.stockQuantity);
  const [status, setStatus] = React.useState(initial.status);
  const [categoryIds, setCategoryIds] = React.useState<string[]>(initial.categoryIds);
  const [images, setImages] = React.useState<UploadedImage[]>(initial.images);
  const [categoryQuery, setCategoryQuery] = React.useState("");
  const descriptionRef = React.useRef<unknown>(initial.description);

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  const suggestedSlug = React.useMemo(() => slugifyPersian(name), [name]);
  const shownSlug = slugTouched ? slug : suggestedSlug;
  const preview = pricePreview(price);

  const filteredCategories = React.useMemo(() => {
    const q = categoryQuery.trim();
    if (!q) return categoryOptions;
    return categoryOptions.filter((option) => option.label.includes(q));
  }, [categoryOptions, categoryQuery]);

  const selectedOptions = categoryOptions.filter((o) => categoryIds.includes(o.id));

  function toggleCategory(id: string, checked: boolean) {
    setCategoryIds((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setFormError(null);
    setErrors({});

    if (!name.trim()) {
      setErrors({ name: ["نام محصول را وارد کنید."] });
      setFormError("لطفاً خطاهای فرم را برطرف کنید.");
      return;
    }

    const payload: ProductFormPayload = {
      name,
      // Untouched auto-slug on create -> let the server pick a unique one.
      slug: isEdit ? shownSlug.trim() || null : slugTouched ? slug.trim() || null : null,
      price: price.trim() === "" ? null : price,
      stockQuantity: stock.trim() === "" ? "0" : stock,
      status,
      categoryIds,
      description: descriptionRef.current,
      images: images.map((image) => ({
        id: image.id,
        storageKey: image.key,
        altText: image.altText ?? null,
      })),
    };

    setPending(true);
    const result =
      isEdit && initial.id
        ? await updateProductAction(initial.id, payload)
        : await createProductAction(payload);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setFormError(result.error);
      toast.error(result.error);
      return;
    }

    if (result.data.warning) toast.warning(result.data.warning);
    toast.success(isEdit ? "تغییرات محصول ذخیره شد." : "محصول ایجاد شد.");

    if (isEdit) {
      router.refresh();
    } else {
      router.replace(routes.admin.productEdit(result.data.id));
    }
  }

  const imagesError = firstErrorWithPrefix(errors, "images");

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
          <CardTitle>اطلاعات پایه</CardTitle>
          <CardDescription>نام، نامک، دسته‌بندی، قیمت و موجودی محصول.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          <Field label="نام محصول" required error={firstError(errors, "name")} className="sm:col-span-2">
            <FormControl>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={200}
                autoComplete="off"
                disabled={pending}
              />
            </FormControl>
          </Field>

          <Field
            label="نامک (آدرس صفحه)"
            error={firstError(errors, "slug")}
            description={
              isEdit
                ? "تغییر نامک، نشانی صفحه محصول را عوض می‌کند."
                : slugTouched
                  ? "نامک دلخواه شما استفاده می‌شود."
                  : "به‌صورت خودکار از نام ساخته می‌شود؛ در صورت نیاز ویرایش کنید. اگر تکراری باشد، شماره به آن اضافه می‌شود."
            }
            className="sm:col-span-2"
          >
            <div className="flex flex-wrap gap-2">
              <FormControl>
                <Input
                  dir="auto"
                  className="min-w-0 flex-1"
                  value={shownSlug}
                  onChange={(event) => {
                    const next = event.target.value;
                    setSlug(next);
                    setSlugTouched(isEdit || next.trim() !== "");
                  }}
                  maxLength={120}
                  autoComplete="off"
                  disabled={pending}
                />
              </FormControl>
              {!isEdit && slugTouched ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setSlugTouched(false);
                    setSlug("");
                  }}
                  disabled={pending}
                >
                  پیشنهاد خودکار
                </Button>
              ) : null}
            </div>
          </Field>

          <Field
            label="قیمت (تومان)"
            error={firstError(errors, "price")}
            description={
              preview
                ? `نمایش در فروشگاه: ${preview}`
                : "خالی بگذارید تا به‌جای قیمت «تماس بگیرید» نمایش داده شود."
            }
          >
            <FormControl>
              <Input
                dir="ltr"
                inputMode="numeric"
                className="text-start"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="۱۲۰۰۰۰۰"
                autoComplete="off"
                disabled={pending}
              />
            </FormControl>
          </Field>

          <Field label="موجودی انبار" error={firstError(errors, "stockQuantity")}>
            <FormControl>
              <Input
                dir="ltr"
                inputMode="numeric"
                className="text-start"
                value={stock}
                onChange={(event) => setStock(event.target.value)}
                placeholder="۰"
                autoComplete="off"
                disabled={pending}
              />
            </FormControl>
          </Field>

          <Field label="وضعیت" error={firstError(errors, "status")}>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as ProductFormPayload["status"])}
              disabled={pending}
            >
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {(Object.keys(STATUS_LABELS) as Array<keyof typeof STATUS_LABELS>).map((key) => (
                  <SelectItem key={key} value={key}>
                    {STATUS_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <fieldset className="grid gap-2 sm:col-span-2" aria-describedby="product-categories-hint">
            <legend className="mb-2 text-sm font-semibold">دسته‌بندی‌ها</legend>
            {categoryOptions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                هنوز دسته‌بندی‌ای ایجاد نشده است.{" "}
                <Link href={routes.admin.categories} className="font-semibold text-primary underline-offset-4 hover:underline">
                  ایجاد دسته‌بندی
                </Link>
              </p>
            ) : (
              <>
                {selectedOptions.length > 0 ? (
                  <ul className="flex flex-wrap gap-1.5" aria-label="دسته‌بندی‌های انتخاب‌شده">
                    {selectedOptions.map((option) => (
                      <li key={option.id}>
                        <Badge variant="secondary" className="gap-1 ps-2 pe-1">
                          {option.label}
                          <button
                            type="button"
                            className="rounded-full p-0.5 outline-none hover:bg-foreground/10 focus-visible:ring-2 focus-visible:ring-ring"
                            onClick={() => toggleCategory(option.id, false)}
                            aria-label={`حذف دسته‌بندی ${option.label}`}
                            disabled={pending}
                          >
                            <XIcon className="size-3" aria-hidden="true" />
                          </button>
                        </Badge>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="rounded-lg border">
                  <div className="relative border-b">
                    <SearchIcon
                      className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      type="search"
                      value={categoryQuery}
                      onChange={(event) => setCategoryQuery(event.target.value)}
                      placeholder="جستجو در دسته‌بندی‌ها"
                      aria-label="جستجو در دسته‌بندی‌ها"
                      className="h-10 rounded-none border-0 ps-9 shadow-none focus-visible:ring-0"
                    />
                  </div>
                  <ul className="max-h-56 overflow-y-auto p-1">
                    {filteredCategories.length === 0 ? (
                      <li className="px-3 py-4 text-center text-sm text-muted-foreground">
                        دسته‌بندی‌ای پیدا نشد.
                      </li>
                    ) : (
                      filteredCategories.map((option) => {
                        const id = `product-category-${option.id}`;
                        return (
                          <li key={option.id}>
                            <label
                              htmlFor={id}
                              className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm hover:bg-accent"
                              style={{ paddingInlineStart: `${0.75 + (categoryQuery ? 0 : option.depth) * 1.25}rem` }}
                            >
                              <Checkbox
                                id={id}
                                checked={categoryIds.includes(option.id)}
                                onCheckedChange={(checked) => toggleCategory(option.id, checked === true)}
                                disabled={pending}
                              />
                              <span>{categoryQuery ? option.label : option.name}</span>
                            </label>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
                <p id="product-categories-hint" className="text-[0.8125rem] text-muted-foreground">
                  هر محصول می‌تواند در چند دسته‌بندی باشد (حداکثر ۲۰).
                </p>
              </>
            )}
            {firstError(errors, "categoryIds") ? (
              <p role="alert" className="text-[0.8125rem] font-medium text-destructive">
                {firstError(errors, "categoryIds")}
              </p>
            ) : null}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>تصاویر</CardTitle>
          <CardDescription>
            تا {toPersianDigits(MAX_PRODUCT_IMAGES)} تصویر. تصویر اول به‌عنوان تصویر اصلی نمایش داده می‌شود.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <ImageUploader
            purpose="product"
            label="تصویر محصول"
            value={images}
            onChange={setImages}
            uploadsEnabled={uploadsEnabled}
            max={MAX_PRODUCT_IMAGES}
            withAltText
            sortable
            disabled={pending}
          />
          {imagesError ? (
            <p role="alert" className="text-[0.8125rem] font-medium text-destructive">
              {imagesError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>توضیحات</CardTitle>
          <CardDescription>
            توضیحات کامل محصول؛ شامل عنوان، فهرست، پیوند، جدول و تصویر.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <RichTextEditor
            value={initial.description}
            onChange={(doc) => {
              descriptionRef.current = doc;
            }}
            uploadsEnabled={uploadsEnabled}
            disabled={pending}
            ariaLabel="توضیحات محصول"
          />
          {firstError(errors, "description") ? (
            <p role="alert" className="text-[0.8125rem] font-medium text-destructive">
              {firstError(errors, "description")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="sticky bottom-0 z-20 -mx-4 flex flex-wrap items-center gap-3 border-t bg-background/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <Button type="submit" disabled={pending}>
          {pending ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <SaveIcon aria-hidden="true" />
          )}
          {pending ? "در حال ذخیره…" : isEdit ? "ذخیره تغییرات" : "ایجاد محصول"}
        </Button>
        <Button asChild variant="outline" disabled={pending}>
          <Link href={routes.admin.products}>بازگشت به فهرست</Link>
        </Button>
      </div>
    </form>
  );
}
