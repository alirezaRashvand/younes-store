"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeftIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { routes } from "@/lib/routes";
import type { CategoryNode } from "@/features/categories/tree";

interface CategoryTreeNavProps {
  tree: ReadonlyArray<CategoryNode>;
  /** Slug of the current category; its ancestors start expanded. */
  activeSlug?: string | null;
  /** Called when a link is followed (e.g. close a mobile sheet). */
  onNavigate?: () => void;
  className?: string;
}

function containsSlug(node: CategoryNode, slug: string | null | undefined): boolean {
  if (!slug) return false;
  return node.slug === slug || node.children.some((c) => containsSlug(c, slug));
}

function TreeItem({
  node,
  depth,
  activeSlug,
  onNavigate,
}: {
  node: CategoryNode;
  depth: number;
  activeSlug?: string | null;
  onNavigate?: () => void;
}) {
  const hasChildren = node.children.length > 0;
  const [expanded, setExpanded] = React.useState(() => containsSlug(node, activeSlug));
  const isActive = node.slug === activeSlug;
  const groupId = React.useId();

  return (
    <li>
      <div
        className={cn(
          "flex items-center gap-1 rounded-md transition-colors",
          isActive ? "bg-accent text-accent-foreground" : "hover:bg-muted",
        )}
      >
        <Link
          href={routes.category(node.slug)}
          aria-current={isActive ? "page" : undefined}
          onClick={onNavigate}
          className={cn(
            "min-w-0 flex-1 truncate rounded-md px-3 py-2 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40",
            isActive ? "font-bold" : depth === 0 ? "font-semibold" : "font-medium text-foreground/80",
          )}
          style={{ paddingInlineStart: `${0.75 + depth * 0.875}rem` }}
        >
          {node.name}
        </Link>
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-controls={groupId}
            aria-label={`${expanded ? "بستن" : "باز کردن"} زیرمجموعه‌های ${node.name}`}
            className="me-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
          >
            <ChevronLeftIcon
              className={cn(
                "size-4 transition-transform duration-200",
                expanded ? "-rotate-90" : "ltr:rotate-180",
              )}
              aria-hidden="true"
            />
          </button>
        ) : null}
      </div>
      {hasChildren && expanded ? (
        <ul id={groupId} className="mt-0.5 space-y-0.5 border-s ms-3">
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activeSlug={activeSlug}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function CategoryTreeNav({ tree, activeSlug, onNavigate, className }: CategoryTreeNavProps) {
  if (tree.length === 0) return null;
  return (
    <nav aria-label="دسته‌بندی‌ها" className={className}>
      <ul className="space-y-0.5">
        {tree.map((node) => (
          <TreeItem
            key={node.id}
            node={node}
            depth={0}
            activeSlug={activeSlug}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </nav>
  );
}
