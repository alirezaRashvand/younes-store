"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  FolderTreeIcon,
  ImageOffIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { toPersianDigits } from "@/lib/format";
import {
  deleteCategoryAction,
  reorderCategoriesAction,
} from "@/features/categories/actions";
import { flattenCategoryOptions } from "@/features/categories/options";
import type { DeleteCategoryStrategy } from "@/features/categories/schema";
import type { CategoryNode } from "@/features/categories/tree";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { CategoryFormDialog } from "@/components/admin/category-form-dialog";

interface CategoryTreeManagerProps {
  tree: CategoryNode[];
  /** categoryId -> number of products linked directly to it */
  productCounts: Record<string, number>;
  uploadsEnabled: boolean;
}

type DialogState =
  | { mode: "create"; parentId: string | null }
  | { mode: "edit"; category: CategoryNode }
  | null;

function countDescendants(node: CategoryNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

function collectIdsWithChildren(nodes: CategoryNode[], into: Set<string>) {
  for (const node of nodes) {
    if (node.children.length > 0) {
      into.add(node.id);
      collectIdsWithChildren(node.children, into);
    }
  }
}

interface RowProps {
  node: CategoryNode;
  siblings: CategoryNode[];
  index: number;
  depth: number;
  expanded: Set<string>;
  busy: boolean;
  productCounts: Record<string, number>;
  onToggle: (id: string) => void;
  onAddChild: (node: CategoryNode) => void;
  onEdit: (node: CategoryNode) => void;
  onDelete: (node: CategoryNode) => void;
  onMove: (siblings: CategoryNode[], index: number, delta: -1 | 1) => void;
}

function CategoryRow(props: RowProps) {
  const { node, siblings, index, depth, expanded, busy, productCounts } = props;
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const childrenId = `category-children-${node.id}`;
  const products = productCounts[node.id] ?? 0;

  return (
    <li>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-card p-2 shadow-xs">
        {hasChildren ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="size-8"
            onClick={() => props.onToggle(node.id)}
            aria-expanded={isOpen}
            aria-controls={childrenId}
            aria-label={`${isOpen ? "بستن" : "باز کردن"} زیرمجموعه‌های ${node.name}`}
          >
            {isOpen ? (
              <ChevronDownIcon aria-hidden="true" />
            ) : (
              <ChevronLeftIcon aria-hidden="true" />
            )}
          </Button>
        ) : (
          <span className="size-8 shrink-0" aria-hidden="true" />
        )}

        <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted">
          {node.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={node.imageUrl} alt="" loading="lazy" className="size-full object-cover" />
          ) : (
            <ImageOffIcon className="size-4 text-muted-foreground" aria-label="بدون تصویر" />
          )}
        </div>

        <div className="min-w-0 flex-1 basis-40">
          <p className="truncate font-semibold">{node.name}</p>
          <p dir="ltr" className="truncate text-start text-xs text-muted-foreground">
            {node.slug}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="muted">{toPersianDigits(products)} محصول</Badge>
          {hasChildren ? (
            <Badge variant="outline">{toPersianDigits(node.children.length)} زیرمجموعه</Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy || index === 0}
            onClick={() => props.onMove(siblings, index, -1)}
            aria-label={`انتقال ${node.name} به بالا`}
            title="انتقال به بالا"
          >
            <ArrowUpIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy || index === siblings.length - 1}
            onClick={() => props.onMove(siblings, index, 1)}
            aria-label={`انتقال ${node.name} به پایین`}
            title="انتقال به پایین"
          >
            <ArrowDownIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            onClick={() => props.onAddChild(node)}
            aria-label={`افزودن زیرمجموعه به ${node.name}`}
            title="افزودن زیرمجموعه"
          >
            <PlusIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={busy}
            onClick={() => props.onEdit(node)}
            aria-label={`ویرایش ${node.name}`}
            title="ویرایش"
          >
            <PencilIcon aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
            disabled={busy}
            onClick={() => props.onDelete(node)}
            aria-label={`حذف ${node.name}`}
            title="حذف"
          >
            <Trash2Icon aria-hidden="true" />
          </Button>
        </div>
      </div>

      {hasChildren && isOpen ? (
        <ul
          id={childrenId}
          aria-label={`زیرمجموعه‌های ${node.name}`}
          className={cn("mt-2 space-y-2 border-s-2 ps-4", depth === 0 ? "ms-5" : "ms-4")}
        >
          {node.children.map((child, childIndex) => (
            <CategoryRow
              key={child.id}
              {...props}
              node={child}
              siblings={node.children}
              index={childIndex}
              depth={depth + 1}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CategoryTreeManager({ tree, productCounts, uploadsEnabled }: CategoryTreeManagerProps) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = React.useTransition();
  const [busy, setBusy] = React.useState(false);
  const [expanded, setExpanded] = React.useState<Set<string>>(
    () => new Set(tree.filter((n) => n.children.length > 0).map((n) => n.id)),
  );
  const [dialog, setDialog] = React.useState<DialogState>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<CategoryNode | null>(null);
  const [strategy, setStrategy] = React.useState<DeleteCategoryStrategy>("promote-children");
  const [deleting, setDeleting] = React.useState(false);

  const disabled = busy || isRefreshing;

  const refresh = React.useCallback(() => {
    startRefresh(() => router.refresh());
  }, [router]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function expandAll() {
    const all = new Set<string>();
    collectIdsWithChildren(tree, all);
    setExpanded(all);
  }

  async function move(siblings: CategoryNode[], index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    const ordered = siblings.map((s) => s.id);
    [ordered[index], ordered[target]] = [ordered[target]!, ordered[index]!];

    setBusy(true);
    const result = await reorderCategoriesAction({
      parentId: siblings[index]!.parentId,
      orderedIds: ordered,
    });
    setBusy(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("ترتیب دسته‌بندی‌ها ذخیره شد.");
    refresh();
  }

  function askDelete(node: CategoryNode) {
    setStrategy(node.children.length > 0 ? "promote-children" : "block");
    setDeleteTarget(node);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await deleteCategoryAction(deleteTarget.id, strategy);
    setDeleting(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(`دسته‌بندی «${deleteTarget.name}» حذف شد.`);
    setDeleteTarget(null);
    refresh();
  }

  const parentOptionsForCreate = React.useMemo(() => flattenCategoryOptions(tree), [tree]);
  const parentOptionsForEdit = React.useMemo(
    () =>
      dialog?.mode === "edit" ? flattenCategoryOptions(tree, dialog.category.id) : [],
    [tree, dialog],
  );

  const deleteChildren = deleteTarget?.children.length ?? 0;
  const deleteProducts = deleteTarget ? (productCounts[deleteTarget.id] ?? 0) : 0;

  return (
    <div className="space-y-4" aria-busy={disabled}>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => setDialog({ mode: "create", parentId: null })} disabled={disabled}>
          <PlusIcon aria-hidden="true" />
          دسته‌بندی جدید
        </Button>
        {tree.some((n) => n.children.length > 0) ? (
          <>
            <Button variant="outline" onClick={expandAll} disabled={disabled}>
              باز کردن همه
            </Button>
            <Button variant="outline" onClick={() => setExpanded(new Set())} disabled={disabled}>
              بستن همه
            </Button>
          </>
        ) : null}
        {isRefreshing || busy ? (
          <span role="status" className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
            در حال به‌روزرسانی…
          </span>
        ) : null}
      </div>

      {tree.length === 0 ? (
        <EmptyState
          icon={FolderTreeIcon}
          title="هنوز دسته‌بندی‌ای ندارید"
          description="با ساخت اولین دسته‌بندی، محصولات را سازمان‌دهی کنید."
          action={
            <Button onClick={() => setDialog({ mode: "create", parentId: null })}>
              <PlusIcon aria-hidden="true" />
              ایجاد دسته‌بندی
            </Button>
          }
        />
      ) : (
        <ul aria-label="درخت دسته‌بندی‌ها" className="space-y-2">
          {tree.map((node, index) => (
            <CategoryRow
              key={node.id}
              node={node}
              siblings={tree}
              index={index}
              depth={0}
              expanded={expanded}
              busy={disabled}
              productCounts={productCounts}
              onToggle={toggle}
              onAddChild={(parent) => {
                setExpanded((prev) => new Set(prev).add(parent.id));
                setDialog({ mode: "create", parentId: parent.id });
              }}
              onEdit={(category) => setDialog({ mode: "edit", category })}
              onDelete={askDelete}
              onMove={move}
            />
          ))}
        </ul>
      )}

      {dialog ? (
        <CategoryFormDialog
          key={dialog.mode === "edit" ? `edit-${dialog.category.id}` : `create-${dialog.parentId ?? "root"}`}
          mode={dialog.mode}
          category={dialog.mode === "edit" ? dialog.category : undefined}
          defaultParentId={dialog.mode === "create" ? dialog.parentId : null}
          parentOptions={dialog.mode === "edit" ? parentOptionsForEdit : parentOptionsForCreate}
          uploadsEnabled={uploadsEnabled}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          onSaved={(_id, parentId) => {
            if (parentId) setExpanded((prev) => new Set(prev).add(parentId));
            refresh();
          }}
        />
      ) : null}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>حذف دسته‌بندی «{deleteTarget?.name}»؟</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {deleteProducts > 0
                    ? `${toPersianDigits(deleteProducts)} محصول از این دسته‌بندی جدا می‌شوند (خود محصولات حذف نمی‌شوند).`
                    : "هیچ محصولی مستقیماً به این دسته‌بندی متصل نیست."}{" "}
                  این کار قابل بازگشت نیست.
                </p>
                {deleteChildren > 0 ? (
                  <p>
                    این دسته‌بندی {toPersianDigits(countDescendants(deleteTarget!))} زیرمجموعه دارد.
                    یکی از روش‌های زیر را انتخاب کنید:
                  </p>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {deleteChildren > 0 ? (
            <fieldset className="space-y-2" disabled={deleting}>
              <legend className="sr-only">روش برخورد با زیرمجموعه‌ها</legend>
              {(
                [
                  {
                    value: "promote-children",
                    title: "انتقال زیرمجموعه‌ها به سطح بالاتر",
                    text: "زیرمجموعه‌های مستقیم به والد این دسته‌بندی منتقل می‌شوند و سپس حذف انجام می‌شود.",
                  },
                  {
                    value: "block",
                    title: "جلوگیری از حذف",
                    text: "تا زمانی که زیرمجموعه دارد، حذف انجام نمی‌شود.",
                  },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm",
                    strategy === option.value && "border-primary bg-primary/5",
                  )}
                >
                  <input
                    type="radio"
                    name="delete-strategy"
                    value={option.value}
                    checked={strategy === option.value}
                    onChange={() => setStrategy(option.value)}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span>
                    <span className="block font-semibold">{option.title}</span>
                    <span className="block text-muted-foreground">{option.text}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>انصراف</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? <Loader2Icon className="animate-spin" aria-hidden="true" /> : null}
              حذف دسته‌بندی
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
