"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { slugifyPersian } from "@/lib/format";
import {
  createCategoryAction,
  updateCategoryAction,
} from "@/features/categories/actions";
import type { CategoryOption } from "@/features/categories/options";
import type { CategoryNode } from "@/features/categories/tree";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FormControl } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader, type UploadedImage } from "@/components/admin/image-uploader";

const ROOT = "__root__";

interface CategoryFormDialogProps {
  mode: "create" | "edit";
  /** Required in edit mode. */
  category?: CategoryNode;
  /** Create mode: pre-selected parent (null = top level). */
  defaultParentId?: string | null;
  /** Parent choices. In edit mode this must already exclude the category's own subtree. */
  parentOptions: CategoryOption[];
  uploadsEnabled: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save (the tree should refresh). */
  onSaved: (savedId: string, parentId: string | null) => void;
}

type FieldErrors = Record<string, string[]>;

/**
 * Mount it only while open (parent controls mounting) so every open starts from fresh state.
 */
export function CategoryFormDialog({
  mode,
  category,
  defaultParentId = null,
  parentOptions,
  uploadsEnabled,
  onOpenChange,
  onSaved,
}: CategoryFormDialogProps) {
  const isEdit = mode === "edit" && category;
  const initialImageKey = category?.imageKey ?? null;

  const [name, setName] = React.useState(category?.name ?? "");
  const [slug, setSlug] = React.useState(category?.slug ?? "");
  const [slugTouched, setSlugTouched] = React.useState(Boolean(isEdit));
  const [description, setDescription] = React.useState(category?.description ?? "");
  const [parentId, setParentId] = React.useState<string>(
    (isEdit ? category.parentId : defaultParentId) ?? ROOT,
  );
  const [images, setImages] = React.useState<UploadedImage[]>(
    category?.imageKey && category.imageUrl
      ? [{ key: category.imageKey, url: category.imageUrl, altText: category.name }]
      : [],
  );

  const [pending, setPending] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<FieldErrors>({});

  const suggestedSlug = slugifyPersian(name);
  const shownSlug = slugTouched ? slug : suggestedSlug;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setFormError(null);
    setErrors({});

    if (!name.trim()) {
      setErrors({ name: ["نام دسته‌بندی را وارد کنید."] });
      return;
    }

    const nextParent = parentId === ROOT ? null : parentId;
    const nextImageKey = images[0]?.key ?? null;
    // Unchanged image -> don't resend (older images may not have a media record).
    const imageKey = nextImageKey === initialImageKey ? undefined : nextImageKey;

    setPending(true);
    const result = isEdit
      ? await updateCategoryAction(category.id, {
          name,
          slug: shownSlug.trim() || null,
          description: description.trim() || null,
          parentId: nextParent,
          imageKey,
        })
      : await createCategoryAction({
          name,
          slug: slugTouched ? shownSlug.trim() || null : null,
          description: description.trim() || null,
          parentId: nextParent,
          imageKey: nextImageKey,
        });
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      setFormError(result.error);
      toast.error(result.error);
      return;
    }

    toast.success(isEdit ? "دسته‌بندی ذخیره شد." : "دسته‌بندی ایجاد شد.");
    onSaved(result.data.id, nextParent);
    onOpenChange(false);
  }

  return (
    <Dialog open onOpenChange={(open) => (pending ? undefined : onOpenChange(open))}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={handleSubmit} noValidate className="grid gap-5">
          <DialogHeader>
            <DialogTitle>{isEdit ? "ویرایش دسته‌بندی" : "دسته‌بندی جدید"}</DialogTitle>
            <DialogDescription>
              {isEdit
                ? "نام، نامک، تصویر و جایگاه دسته‌بندی را ویرایش کنید."
                : "اطلاعات دسته‌بندی جدید را وارد کنید."}
            </DialogDescription>
          </DialogHeader>

          {formError ? (
            <Alert variant="destructive">
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <Field label="نام دسته‌بندی" required error={errors.name?.[0]}>
            <FormControl>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoComplete="off"
                autoFocus
                disabled={pending}
              />
            </FormControl>
          </Field>

          <Field
            label="نامک (آدرس صفحه)"
            error={errors.slug?.[0]}
            description={
              isEdit
                ? undefined
                : "خالی یا خودکار: از نام ساخته می‌شود و در صورت تکراری بودن شماره می‌گیرد."
            }
          >
            <FormControl>
              <Input
                dir="auto"
                value={shownSlug}
                onChange={(event) => {
                  setSlug(event.target.value);
                  setSlugTouched(Boolean(isEdit) || event.target.value.trim() !== "");
                }}
                maxLength={120}
                autoComplete="off"
                disabled={pending}
              />
            </FormControl>
          </Field>

          <Field label="دسته‌بندی والد" error={errors.parentId?.[0]}>
            <Select value={parentId} onValueChange={setParentId} disabled={pending}>
              <FormControl>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                <SelectItem value={ROOT}>بدون والد (سطح اصلی)</SelectItem>
                {parentOptions.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="توضیحات" error={errors.description?.[0]}>
            <FormControl>
              <Textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={1000}
                rows={3}
                disabled={pending}
              />
            </FormControl>
          </Field>

          <div className="grid gap-2">
            <span className="text-sm font-semibold">تصویر دسته‌بندی</span>
            <ImageUploader
              purpose="category"
              label="تصویر دسته‌بندی"
              value={images}
              onChange={setImages}
              uploadsEnabled={uploadsEnabled}
              max={1}
              disabled={pending}
            />
            {errors.imageKey?.[0] || errors.imageUrl?.[0] ? (
              <p role="alert" className="text-[0.8125rem] font-medium text-destructive">
                {errors.imageKey?.[0] ?? errors.imageUrl?.[0]}
              </p>
            ) : null}
          </div>

          <DialogFooter className="gap-2 sm:justify-start">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
              {pending ? "در حال ذخیره…" : isEdit ? "ذخیره تغییرات" : "ایجاد دسته‌بندی"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => onOpenChange(false)}
            >
              انصراف
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
