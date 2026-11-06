"use client";

import * as React from "react";
import { toast } from "sonner";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import type { JSONContent } from "@tiptap/core";
import {
  BoldIcon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ImageIcon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  Loader2Icon,
  PilcrowIcon,
  QuoteIcon,
  Redo2Icon,
  TableIcon,
  Undo2Icon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { sanitizeUrl } from "@/lib/rich-text";
import { uploadImage } from "@/lib/storage/client-upload";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/lib/storage/constants";
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
import { Separator } from "@/components/ui/separator";

interface RichTextEditorProps {
  /** Initial Tiptap JSON document (the editor is uncontrolled after mount). */
  value?: unknown;
  /** Called with the Tiptap JSON document on every change. */
  onChange: (doc: JSONContent) => void;
  /** false when S3 is not configured: the image button is disabled and explains why. */
  uploadsEnabled: boolean;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}

const IMAGE_ACCEPT = ALLOWED_IMAGE_MIME_TYPES.join(",");

function isDoc(value: unknown): value is JSONContent {
  return typeof value === "object" && value !== null && (value as { type?: unknown }).type === "doc";
}

function normalizeHref(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value) || value.startsWith("/") || value.startsWith("#")) {
    return value;
  }
  return `https://${value}`;
}

interface ToolButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}

function ToolButton({ label, onClick, active = false, disabled = false, children }: ToolButtonProps) {
  return (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      className={cn("size-8", active && "bg-primary/10 text-primary hover:bg-primary/15")}
      aria-label={label}
      title={label}
      aria-pressed={active}
      disabled={disabled}
      // keep the editor selection when clicking toolbar buttons
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function RichTextEditor({
  value,
  onChange,
  uploadsEnabled,
  disabled = false,
  placeholder = "توضیحات را اینجا بنویسید…",
  ariaLabel = "ویرایشگر توضیحات",
  className,
}: RichTextEditorProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [linkOpen, setLinkOpen] = React.useState(false);
  const [linkValue, setLinkValue] = React.useState("");
  const [linkError, setLinkError] = React.useState<string | null>(null);

  const editor = useEditor({
    immediatelyRender: false, // avoids SSR hydration mismatch
    editable: !disabled,
    content: isDoc(value) ? value : undefined,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3, 4] },
        link: {
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
        },
      }),
      Image.configure({ inline: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        class: "rich-text-content",
        dir: "rtl",
        role: "textbox",
        "aria-multiline": "true",
        "aria-label": ariaLabel,
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getJSON()),
  });

  React.useEffect(() => {
    editor?.setEditable(!disabled);
  }, [editor, disabled]);

  const state = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            paragraph: current.isActive("paragraph"),
            h2: current.isActive("heading", { level: 2 }),
            h3: current.isActive("heading", { level: 3 }),
            h4: current.isActive("heading", { level: 4 }),
            bold: current.isActive("bold"),
            italic: current.isActive("italic"),
            bullet: current.isActive("bulletList"),
            ordered: current.isActive("orderedList"),
            quote: current.isActive("blockquote"),
            link: current.isActive("link"),
            inTable: current.isActive("table"),
            canUndo: current.can().undo(),
            canRedo: current.can().redo(),
          }
        : null,
  });

  if (!editor || !state) {
    return (
      <div
        role="status"
        aria-busy="true"
        className={cn("h-64 animate-pulse rounded-lg border bg-muted/40", className)}
      >
        <span className="sr-only">در حال آماده‌سازی ویرایشگر…</span>
      </div>
    );
  }

  const chain = () => editor.chain().focus();

  function openLinkDialog() {
    const current = editor!.getAttributes("link").href as string | undefined;
    setLinkValue(current ?? "");
    setLinkError(null);
    setLinkOpen(true);
  }

  function applyLink(event: React.FormEvent) {
    event.preventDefault();
    event.stopPropagation();
    const href = normalizeHref(linkValue);
    if (!href) {
      chain().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const safe = sanitizeUrl(href, { allowMailtoTel: true });
    if (!safe) {
      setLinkError("نشانی واردشده معتبر نیست. فقط http، https، mailto و tel مجاز است.");
      return;
    }
    if (editor!.state.selection.empty && !editor!.isActive("link")) {
      editor!
        .chain()
        .focus()
        .insertContent({ type: "text", text: safe, marks: [{ type: "link", attrs: { href: safe } }] })
        .run();
    } else {
      chain().extendMarkRange("link").setLink({ href: safe }).run();
    }
    setLinkOpen(false);
  }

  async function handleImageFile(file: File) {
    setUploading(true);
    const result = await uploadImage(file, "editor");
    setUploading(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    const alt = file.name.replace(/\.[^.]+$/, "");
    chain().setImage({ src: result.data.url, alt }).run();
    toast.success("تصویر به توضیحات اضافه شد.");
  }

  const toolsDisabled = disabled;

  return (
    <div className={cn("overflow-hidden rounded-lg border bg-background shadow-xs", className)}>
      <div
        role="toolbar"
        aria-label="ابزارهای ویرایشگر"
        className="flex flex-wrap items-center gap-0.5 border-b bg-muted/40 p-1.5"
      >
        <ToolButton
          label="واگرد"
          onClick={() => chain().undo().run()}
          disabled={toolsDisabled || !state.canUndo}
        >
          <Undo2Icon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="ازنو"
          onClick={() => chain().redo().run()}
          disabled={toolsDisabled || !state.canRedo}
        >
          <Redo2Icon aria-hidden="true" />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolButton
          label="پاراگراف"
          active={state.paragraph}
          disabled={toolsDisabled}
          onClick={() => chain().setParagraph().run()}
        >
          <PilcrowIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="عنوان سطح ۲"
          active={state.h2}
          disabled={toolsDisabled}
          onClick={() => chain().toggleHeading({ level: 2 }).run()}
        >
          <Heading2Icon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="عنوان سطح ۳"
          active={state.h3}
          disabled={toolsDisabled}
          onClick={() => chain().toggleHeading({ level: 3 }).run()}
        >
          <Heading3Icon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="عنوان سطح ۴"
          active={state.h4}
          disabled={toolsDisabled}
          onClick={() => chain().toggleHeading({ level: 4 }).run()}
        >
          <Heading4Icon aria-hidden="true" />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolButton
          label="پررنگ"
          active={state.bold}
          disabled={toolsDisabled}
          onClick={() => chain().toggleBold().run()}
        >
          <BoldIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="کج"
          active={state.italic}
          disabled={toolsDisabled}
          onClick={() => chain().toggleItalic().run()}
        >
          <ItalicIcon aria-hidden="true" />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolButton
          label="فهرست نقطه‌ای"
          active={state.bullet}
          disabled={toolsDisabled}
          onClick={() => chain().toggleBulletList().run()}
        >
          <ListIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="فهرست شماره‌دار"
          active={state.ordered}
          disabled={toolsDisabled}
          onClick={() => chain().toggleOrderedList().run()}
        >
          <ListOrderedIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="نقل‌قول"
          active={state.quote}
          disabled={toolsDisabled}
          onClick={() => chain().toggleBlockquote().run()}
        >
          <QuoteIcon aria-hidden="true" />
        </ToolButton>

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ToolButton
          label="پیوند"
          active={state.link}
          disabled={toolsDisabled}
          onClick={openLinkDialog}
        >
          <LinkIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label="درج جدول"
          active={state.inTable}
          disabled={toolsDisabled || state.inTable}
          onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
        >
          <TableIcon aria-hidden="true" />
        </ToolButton>
        <ToolButton
          label={
            uploadsEnabled
              ? "درج تصویر"
              : "درج تصویر (نیازمند پیکربندی S3 است)"
          }
          disabled={toolsDisabled || !uploadsEnabled || uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading ? (
            <Loader2Icon className="animate-spin" aria-hidden="true" />
          ) : (
            <ImageIcon aria-hidden="true" />
          )}
        </ToolButton>
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handleImageFile(file);
          }}
        />
      </div>

      {state.inTable ? (
        <div
          role="toolbar"
          aria-label="ابزارهای جدول"
          className="flex flex-wrap items-center gap-1 border-b bg-accent/40 px-2 py-1.5 text-xs"
        >
          <span className="me-1 font-semibold text-muted-foreground">جدول:</span>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addRowAfter().run()}>
            افزودن ردیف
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().addColumnAfter().run()}>
            افزودن ستون
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().toggleHeaderRow().run()}>
            ردیف عنوان
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteRow().run()}>
            حذف ردیف
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteColumn().run()}>
            حذف ستون
          </Button>
          <Button type="button" variant="destructive" size="sm" className="h-7 px-2 text-xs" onMouseDown={(e) => e.preventDefault()} onClick={() => chain().deleteTable().run()}>
            حذف جدول
          </Button>
        </div>
      ) : null}

      <EditorContent editor={editor} />

      {!uploadsEnabled ? (
        <p className="border-t bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          درج تصویر در توضیحات نیازمند پیکربندی ذخیره‌سازی S3 است و فعلاً غیرفعال است.
        </p>
      ) : null}

      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={applyLink} className="grid gap-4">
            <DialogHeader>
              <DialogTitle>افزودن پیوند</DialogTitle>
              <DialogDescription>
                نشانی پیوند را وارد کنید. برای حذف پیوند، فیلد را خالی بگذارید و تأیید کنید.
              </DialogDescription>
            </DialogHeader>
            <Field label="نشانی پیوند" error={linkError}>
              <FormControl>
                <Input
                  dir="ltr"
                  value={linkValue}
                  onChange={(event) => {
                    setLinkValue(event.target.value);
                    setLinkError(null);
                  }}
                  placeholder="https://example.com"
                  autoFocus
                />
              </FormControl>
            </Field>
            <DialogFooter className="gap-2 sm:justify-start">
              <Button type="submit">تأیید</Button>
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>
                انصراف
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
