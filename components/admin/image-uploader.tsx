"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  ImagePlusIcon,
  Loader2Icon,
  TriangleAlertIcon,
  XIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/format";
import { uploadImage } from "@/lib/storage/client-upload";
import { ALLOWED_IMAGE_MIME_TYPES, type UploadPurpose } from "@/lib/storage/constants";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UPLOADS_DISABLED_MESSAGE } from "@/components/admin/admin-utils";

export interface UploadedImage {
  /** Database id for images that are already attached to the product. */
  id?: string;
  /** Storage key (never rendered; sent back to the server to associate the image). */
  key: string;
  url: string;
  altText?: string | null;
}

interface PendingUpload {
  tempId: string;
  name: string;
  progress: number;
}

interface ImageUploaderProps {
  purpose: UploadPurpose;
  value: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  /** false when S3 env vars are missing: uploading is disabled and a message is shown. */
  uploadsEnabled: boolean;
  max?: number;
  /** Show an alt-text field under each image. */
  withAltText?: boolean;
  /** First image is the primary one; show the badge + reorder controls. */
  sortable?: boolean;
  disabled?: boolean;
  /** Used for aria labels, e.g. "تصویر محصول". */
  label?: string;
  className?: string;
}

const ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(",");

export function ImageUploader({
  purpose,
  value,
  onChange,
  uploadsEnabled,
  max = 10,
  withAltText = false,
  sortable = false,
  disabled = false,
  label = "تصویر",
  className,
}: ImageUploaderProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<PendingUpload[]>([]);
  const [dragging, setDragging] = React.useState(false);

  // Uploads finish asynchronously; keep the latest list in a ref so they never clobber each other.
  const valueRef = React.useRef(value);
  React.useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const busy = pending.length > 0;
  const remaining = max - value.length - pending.length;
  const canUpload = uploadsEnabled && !disabled && remaining > 0;

  function commit(next: UploadedImage[]) {
    valueRef.current = next;
    onChange(next);
  }

  async function handleFiles(fileList: FileList | File[]) {
    if (!canUpload) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;

    const accepted = files.slice(0, remaining);
    if (files.length > accepted.length) {
      toast.warning(`حداکثر ${toPersianDigits(max)} ${label} مجاز است؛ ${toPersianDigits(files.length - accepted.length)} فایل نادیده گرفته شد.`);
    }

    const entries = accepted.map((file) => ({
      file,
      tempId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    }));
    setPending((prev) => [
      ...prev,
      ...entries.map((e) => ({ tempId: e.tempId, name: e.file.name, progress: 0 })),
    ]);

    // Sequential: keeps the server load predictable and the order deterministic.
    for (const { file, tempId } of entries) {
      const result = await uploadImage(file, purpose, (progress) =>
        setPending((prev) => prev.map((p) => (p.tempId === tempId ? { ...p, progress } : p))),
      );
      setPending((prev) => prev.filter((p) => p.tempId !== tempId));

      if (!result.ok) {
        toast.error(`«${file.name}»: ${result.error}`);
        continue;
      }
      if (valueRef.current.some((img) => img.key === result.data.key)) continue;
      commit([...valueRef.current, { key: result.data.key, url: result.data.url, altText: null }]);
    }
  }

  function remove(index: number) {
    commit(valueRef.current.filter((_, i) => i !== index));
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= valueRef.current.length) return;
    const next = [...valueRef.current];
    [next[index], next[target]] = [next[target]!, next[index]!];
    commit(next);
  }

  function setAlt(index: number, altText: string) {
    commit(valueRef.current.map((img, i) => (i === index ? { ...img, altText } : img)));
  }

  return (
    <div className={cn("space-y-4", className)}>
      {!uploadsEnabled ? (
        <Alert variant="warning" role="status">
          <TriangleAlertIcon aria-hidden="true" />
          <AlertTitle>بارگذاری تصویر غیرفعال است</AlertTitle>
          <AlertDescription>
            {UPLOADS_DISABLED_MESSAGE} بدون تصویر هم می‌توانید ذخیره کنید.
          </AlertDescription>
        </Alert>
      ) : null}

      {value.length > 0 || pending.length > 0 ? (
        <ul
          className={cn(
            "grid gap-3",
            max === 1 ? "grid-cols-1 sm:max-w-56" : "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4",
          )}
          aria-label={`${label} بارگذاری‌شده`}
        >
          {value.map((image, index) => (
            <li key={image.key} className="space-y-2 rounded-lg border bg-card p-2">
              <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt={image.altText || `${label} ${toPersianDigits(index + 1)}`}
                  className="size-full object-cover"
                  loading="lazy"
                />
                {sortable && index === 0 ? (
                  <Badge className="absolute start-1.5 top-1.5">اصلی</Badge>
                ) : null}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="secondary"
                  className="absolute end-1.5 top-1.5 size-7 rounded-full shadow"
                  onClick={() => remove(index)}
                  disabled={disabled || busy}
                  aria-label={`حذف ${label} ${toPersianDigits(index + 1)}`}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </div>

              {sortable && value.length > 1 ? (
                <div className="flex items-center justify-between gap-1">
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="size-8"
                    onClick={() => move(index, -1)}
                    disabled={disabled || busy || index === 0}
                    aria-label={`انتقال ${label} ${toPersianDigits(index + 1)} به قبل`}
                  >
                    <ChevronRightIcon aria-hidden="true" />
                  </Button>
                  <span className="text-xs text-muted-foreground" aria-hidden="true">
                    {toPersianDigits(index + 1)} از {toPersianDigits(value.length)}
                  </span>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant="outline"
                    className="size-8"
                    onClick={() => move(index, 1)}
                    disabled={disabled || busy || index === value.length - 1}
                    aria-label={`انتقال ${label} ${toPersianDigits(index + 1)} به بعد`}
                  >
                    <ChevronLeftIcon aria-hidden="true" />
                  </Button>
                </div>
              ) : null}

              {withAltText ? (
                <Input
                  value={image.altText ?? ""}
                  onChange={(event) => setAlt(index, event.target.value)}
                  maxLength={300}
                  disabled={disabled}
                  placeholder="متن جایگزین (اختیاری)"
                  aria-label={`متن جایگزین ${label} ${toPersianDigits(index + 1)}`}
                  className="h-8 text-xs"
                />
              ) : null}
            </li>
          ))}

          {pending.map((item) => (
            <li
              key={item.tempId}
              className="flex aspect-square flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-muted/50 p-3 text-center"
              role="status"
              aria-label={`در حال بارگذاری ${item.name}`}
            >
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" aria-hidden="true" />
              <span className="text-xs font-semibold tabular-nums">
                {toPersianDigits(item.progress)}٪
              </span>
              <span dir="ltr" className="line-clamp-1 max-w-full text-[0.6875rem] text-muted-foreground">
                {item.name}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div
        onDragOver={(event) => {
          if (!canUpload) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void handleFiles(event.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
          dragging ? "border-primary bg-primary/5" : "bg-muted/30",
          !canUpload && "opacity-60",
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          multiple={max > 1}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          disabled={!canUpload}
          onChange={(event) => {
            const files = event.target.files;
            if (files) void handleFiles(files);
            event.target.value = ""; // allow re-selecting the same file
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={!canUpload}
        >
          {busy ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <ImagePlusIcon aria-hidden="true" />
          )}
          {busy ? "در حال بارگذاری…" : `انتخاب ${label}`}
        </Button>
        <p className="text-xs text-muted-foreground">
          {uploadsEnabled
            ? remaining > 0
              ? `JPEG، PNG یا WebP تا ۵ مگابایت؛ فایل را اینجا رها کنید. (${toPersianDigits(value.length)} از ${toPersianDigits(max)})`
              : `به حداکثر تعداد مجاز (${toPersianDigits(max)}) رسیده‌اید.`
            : "بارگذاری فایل غیرفعال است."}
        </p>
      </div>
    </div>
  );
}
