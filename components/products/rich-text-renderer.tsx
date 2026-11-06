import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import {
  isEmptyTiptapDoc,
  sanitizeTiptapDoc,
  sanitizeUrl,
  type TiptapMark,
  type TiptapNode,
} from "@/lib/rich-text";

/**
 * Renders stored Tiptap JSON as React elements.
 *
 * Safety model: the document is re-sanitized (whitelist of nodes/marks/attrs,
 * safe URL protocols only) on every render, and output is built exclusively
 * from React elements. No HTML string is ever parsed or injected.
 */

type Align = "left" | "right" | "center" | "justify";
const ALIGNS = new Set<string>(["left", "right", "center", "justify"]);

function alignStyle(node: TiptapNode): React.CSSProperties | undefined {
  const value = node.attrs?.textAlign;
  return typeof value === "string" && ALIGNS.has(value)
    ? { textAlign: value as Align }
    : undefined;
}

function numAttr(node: TiptapNode, key: string): number | undefined {
  const value = node.attrs?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function strAttr(node: TiptapNode | TiptapMark, key: string): string | undefined {
  const value = node.attrs?.[key];
  return typeof value === "string" ? value : undefined;
}

function isExternal(href: string): boolean {
  return /^https?:\/\//i.test(href);
}

function renderText(node: TiptapNode, key: React.Key): React.ReactNode {
  let element: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        element = <strong className="font-bold">{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "strike":
        element = <s>{element}</s>;
        break;
      case "underline":
        element = <u className="underline-offset-2">{element}</u>;
        break;
      case "code":
        element = (
          <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em]" dir="ltr">
            {element}
          </code>
        );
        break;
      case "link": {
        const href = sanitizeUrl(strAttr(mark, "href"), { allowMailtoTel: true });
        if (!href) break;
        const external = isExternal(href);
        element = (
          <a
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer nofollow" } : {})}
            className="font-semibold text-primary underline underline-offset-4 hover:text-primary/80"
          >
            {element}
          </a>
        );
        break;
      }
      default:
        break;
    }
  }
  return <React.Fragment key={key}>{element}</React.Fragment>;
}

function renderChildren(nodes: TiptapNode[] | undefined): React.ReactNode[] {
  return (nodes ?? []).map((child, i) => renderNode(child, i));
}

const HEADING_CLASSES: Record<number, string> = {
  2: "mt-8 mb-3 text-xl font-extrabold sm:text-2xl",
  3: "mt-6 mb-2 text-lg font-bold sm:text-xl",
  4: "mt-5 mb-2 text-base font-bold sm:text-lg",
  5: "mt-4 mb-2 text-base font-bold",
  6: "mt-4 mb-2 text-sm font-bold",
};

function renderNode(node: TiptapNode, key: React.Key): React.ReactNode {
  switch (node.type) {
    case "text":
      return renderText(node, key);
    case "hardBreak":
      return <br key={key} />;
    case "paragraph":
      return (
        <p key={key} style={alignStyle(node)} className="my-3 leading-8">
          {renderChildren(node.content)}
        </p>
      );
    case "heading": {
      // The product page already owns the <h1>, so rich-text headings start at <h2>.
      const level = Math.min(Math.max((numAttr(node, "level") ?? 2) + 1, 2), 6);
      const Tag = `h${level}` as "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={key} style={alignStyle(node)} className={HEADING_CLASSES[level]}>
          {renderChildren(node.content)}
        </Tag>
      );
    }
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="my-4 border-s-4 border-primary/30 bg-muted/50 py-1 ps-4 text-muted-foreground"
        >
          {renderChildren(node.content)}
        </blockquote>
      );
    case "bulletList":
      return (
        <ul key={key} className="my-3 list-disc space-y-1 ps-6 marker:text-primary/60">
          {renderChildren(node.content)}
        </ul>
      );
    case "orderedList": {
      const start = numAttr(node, "start");
      const type = strAttr(node, "type");
      return (
        <ol
          key={key}
          start={start}
          type={type && ["1", "a", "A", "i", "I"].includes(type) ? (type as "1") : undefined}
          className="my-3 list-decimal space-y-1 ps-6 marker:text-primary/60"
        >
          {renderChildren(node.content)}
        </ol>
      );
    }
    case "listItem":
      return (
        <li key={key} className="leading-8 [&>p]:my-1">
          {renderChildren(node.content)}
        </li>
      );
    case "codeBlock":
      return (
        <pre
          key={key}
          dir="ltr"
          className="my-4 overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-sm leading-6"
        >
          <code>{(node.content ?? []).map((c) => c.text ?? "").join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr key={key} className="my-6 border-border" />;
    case "image": {
      const src = sanitizeUrl(strAttr(node, "src"));
      if (!src) return null;
      const width = numAttr(node, "width") ?? 800;
      const height = numAttr(node, "height") ?? 600;
      return (
        <Image
          key={key}
          src={src}
          alt={strAttr(node, "alt") ?? ""}
          title={strAttr(node, "title")}
          width={width}
          height={height}
          unoptimized
          className="my-4 h-auto max-w-full rounded-lg border"
          sizes="(min-width: 1024px) 50vw, 100vw"
        />
      );
    }
    case "table":
      return (
        <div key={key} className="my-4 overflow-x-auto rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <tbody>{renderChildren(node.content)}</tbody>
          </table>
        </div>
      );
    case "tableRow":
      return (
        <tr key={key} className="border-b last:border-b-0">
          {renderChildren(node.content)}
        </tr>
      );
    case "tableHeader":
    case "tableCell": {
      const Tag = node.type === "tableHeader" ? "th" : "td";
      return (
        <Tag
          key={key}
          colSpan={numAttr(node, "colspan")}
          rowSpan={numAttr(node, "rowspan")}
          className={cn(
            "border-e px-3 py-2 align-top last:border-e-0 [&>p]:my-0",
            Tag === "th" && "bg-muted/60 text-start font-bold",
          )}
        >
          {renderChildren(node.content)}
        </Tag>
      );
    }
    default:
      return null;
  }
}

interface RichTextRendererProps {
  /** Raw JSON from the database (Tiptap doc). Anything invalid renders nothing. */
  content: unknown;
  className?: string;
}

export function RichTextRenderer({ content, className }: RichTextRendererProps) {
  if (content === null || content === undefined || isEmptyTiptapDoc(content)) return null;
  const doc = sanitizeTiptapDoc(content);
  return (
    <div className={cn("text-[0.9375rem] text-foreground/90 [&>:first-child]:mt-0", className)}>
      {renderChildren(doc.content)}
    </div>
  );
}
