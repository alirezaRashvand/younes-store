/**
 * Tiptap (ProseMirror) JSON helpers: validation, XSS-safe sanitization, plain text.
 * Pure TypeScript (no DOM) so it works on server, client and in tests.
 *
 * Strategy: WHITELIST. Unknown node types/marks/attributes are dropped, URLs are
 * restricted to safe protocols, and raw HTML is never stored or produced.
 */

export type TiptapAttrValue = string | number | boolean | null | number[];
export type TiptapAttrs = { [key: string]: TiptapAttrValue };

export type TiptapMark = {
  type: string;
  attrs?: TiptapAttrs;
};

export type TiptapNode = {
  type: string;
  attrs?: TiptapAttrs;
  content?: TiptapNode[];
  marks?: TiptapMark[];
  text?: string;
};

export type TiptapDoc = {
  type: "doc";
  content: TiptapNode[];
};

export const TIPTAP_MAX_DEPTH = 20;
export const TIPTAP_MAX_NODES = 5000;
export const TIPTAP_MAX_TEXT_LENGTH = 100_000;
export const TIPTAP_MAX_JSON_BYTES = 500_000;

const BLOCK_NODES = new Set([
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "codeBlock",
  "horizontalRule",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "image",
]);
const INLINE_NODES = new Set(["text", "hardBreak"]);
const ALLOWED_NODES = new Set([...BLOCK_NODES, ...INLINE_NODES]);
const ALLOWED_MARKS = new Set(["bold", "italic", "strike", "underline", "code", "link"]);

type AttrSanitizer = (value: unknown) => TiptapAttrValue | undefined;

const str =
  (max: number): AttrSanitizer =>
  (v) =>
    typeof v === "string" ? v.slice(0, max) : undefined;

const intRange =
  (min: number, max: number): AttrSanitizer =>
  (v) =>
    typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : undefined;

const positiveNumber: AttrSanitizer = (v) =>
  typeof v === "number" && Number.isFinite(v) && v > 0 && v <= 10_000 ? v : undefined;

const oneOf =
  (...values: string[]): AttrSanitizer =>
  (v) =>
    typeof v === "string" && values.includes(v) ? v : undefined;

const textAlign = oneOf("left", "right", "center", "justify");

const colwidth: AttrSanitizer = (v) => {
  if (v === null) return null;
  if (
    Array.isArray(v) &&
    v.length <= 50 &&
    v.every((n) => typeof n === "number" && Number.isFinite(n) && n > 0 && n < 5000)
  ) {
    return v as number[];
  }
  return undefined;
};

const codeLanguage: AttrSanitizer = (v) =>
  v === null ? null : typeof v === "string" && /^[a-zA-Z0-9_+#-]{1,30}$/.test(v) ? v : undefined;

/** Allow http(s), mailto, tel, and same-site relative URLs only. */
export function sanitizeUrl(
  value: unknown,
  opts: { allowMailtoTel?: boolean } = {},
): string | null {
  if (typeof value !== "string") return null;
  // Strip control chars/whitespace that browsers ignore inside schemes (e.g. "java\nscript:").
  const cleaned = value.replace(/[\u0000-\u001F\u007F\s]+/g, "");
  if (!cleaned || cleaned.length > 2000) return null;

  if (cleaned.startsWith("//") || cleaned.startsWith("/\\")) return null;
  if (cleaned.startsWith("/") || cleaned.startsWith("#")) return cleaned;

  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (!match) return null; // relative without slash: reject to stay unambiguous
  const protocol = match[1]!.toLowerCase();
  if (protocol === "http" || protocol === "https") return cleaned;
  if (opts.allowMailtoTel && (protocol === "mailto" || protocol === "tel")) return cleaned;
  return null;
}

const urlAttr =
  (opts: { allowMailtoTel?: boolean } = {}): AttrSanitizer =>
  (v) =>
    sanitizeUrl(v, opts) ?? undefined;

const NODE_ATTRS: Record<string, Record<string, AttrSanitizer>> = {
  paragraph: { textAlign },
  heading: { level: intRange(1, 6), textAlign },
  orderedList: { start: intRange(1, 100_000), type: oneOf("1", "a", "A", "i", "I") },
  codeBlock: { language: codeLanguage },
  image: {
    src: urlAttr(),
    alt: str(300),
    title: str(300),
    width: positiveNumber,
    height: positiveNumber,
  },
  tableCell: { colspan: intRange(1, 50), rowspan: intRange(1, 50), colwidth },
  tableHeader: { colspan: intRange(1, 50), rowspan: intRange(1, 50), colwidth },
};

const MARK_ATTRS: Record<string, Record<string, AttrSanitizer>> = {
  link: { href: urlAttr({ allowMailtoTel: true }) },
};

function sanitizeAttrs(
  attrs: unknown,
  schema: Record<string, AttrSanitizer> | undefined,
): TiptapAttrs | undefined {
  if (!schema || typeof attrs !== "object" || attrs === null || Array.isArray(attrs)) {
    return undefined;
  }
  const out: TiptapAttrs = {};
  for (const [key, sanitizer] of Object.entries(schema)) {
    if (!Object.prototype.hasOwnProperty.call(attrs, key)) continue;
    const cleaned = sanitizer((attrs as Record<string, unknown>)[key]);
    if (cleaned !== undefined) out[key] = cleaned;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ── Validation ───────────────────────────────────────────────────────────

export type TiptapValidation =
  | { success: true; doc: TiptapDoc }
  | { success: false; error: string };

/**
 * Structural validation: { type: 'doc', content: [...] } with only known nodes,
 * sane depth/size. Does NOT sanitize attributes — call sanitizeTiptapDoc after.
 */
export function validateTiptapDoc(json: unknown): TiptapValidation {
  let value: unknown = json;
  if (typeof value === "string") {
    if (value.length > TIPTAP_MAX_JSON_BYTES) {
      return { success: false, error: "محتوای توضیحات بیش از حد بزرگ است." };
    }
    try {
      value = JSON.parse(value);
    } catch {
      return { success: false, error: "قالب توضیحات نامعتبر است." };
    }
  }

  if (!isPlainObject(value) || value.type !== "doc") {
    return { success: false, error: "قالب توضیحات نامعتبر است." };
  }
  if (!Array.isArray(value.content)) {
    return { success: false, error: "قالب توضیحات نامعتبر است." };
  }

  let nodeCount = 0;
  let textLength = 0;
  let failure = null as string | null;

  const visit = (node: unknown, depth: number): void => {
    if (failure) return;
    if (depth > TIPTAP_MAX_DEPTH) {
      failure = "ساختار توضیحات بیش از حد تو در تو است.";
      return;
    }
    if (!isPlainObject(node) || typeof node.type !== "string") {
      failure = "قالب توضیحات نامعتبر است.";
      return;
    }
    if (!ALLOWED_NODES.has(node.type)) {
      failure = "توضیحات شامل عنصر غیرمجاز است.";
      return;
    }
    if (++nodeCount > TIPTAP_MAX_NODES) {
      failure = "محتوای توضیحات بیش از حد بزرگ است.";
      return;
    }
    if (node.type === "text") {
      if (typeof node.text !== "string") {
        failure = "قالب توضیحات نامعتبر است.";
        return;
      }
      textLength += node.text.length;
      if (textLength > TIPTAP_MAX_TEXT_LENGTH) {
        failure = "متن توضیحات بیش از حد طولانی است.";
        return;
      }
    }
    if (node.marks !== undefined) {
      if (!Array.isArray(node.marks)) {
        failure = "قالب توضیحات نامعتبر است.";
        return;
      }
      for (const mark of node.marks) {
        if (!isPlainObject(mark) || typeof mark.type !== "string" || !ALLOWED_MARKS.has(mark.type)) {
          failure = "توضیحات شامل قالب‌بندی غیرمجاز است.";
          return;
        }
      }
    }
    if (node.content !== undefined) {
      if (!Array.isArray(node.content)) {
        failure = "قالب توضیحات نامعتبر است.";
        return;
      }
      for (const child of node.content) visit(child, depth + 1);
    }
  };

  for (const child of value.content) visit(child, 1);
  if (failure) return { success: false, error: failure };

  return { success: true, doc: sanitizeTiptapDoc(value) };
}

// ── Sanitization ─────────────────────────────────────────────────────────

function sanitizeMarks(marks: unknown): TiptapMark[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const out: TiptapMark[] = [];
  for (const mark of marks) {
    if (!isPlainObject(mark) || typeof mark.type !== "string") continue;
    if (!ALLOWED_MARKS.has(mark.type)) continue;

    if (mark.type === "link") {
      const attrs = sanitizeAttrs(mark.attrs, MARK_ATTRS.link);
      if (!attrs?.href) continue; // drop links with unsafe/missing href
      out.push({
        type: "link",
        // Forced values: never trust target/rel from input.
        attrs: { href: attrs.href, target: "_blank", rel: "noopener noreferrer nofollow" },
      });
    } else {
      out.push({ type: mark.type });
    }
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeNode(node: unknown, depth: number, budget: { nodes: number }): TiptapNode | null {
  if (depth > TIPTAP_MAX_DEPTH) return null;
  if (!isPlainObject(node) || typeof node.type !== "string") return null;
  if (!ALLOWED_NODES.has(node.type)) return null;
  if (budget.nodes <= 0) return null;
  budget.nodes--;

  if (node.type === "text") {
    if (typeof node.text !== "string" || node.text.length === 0) return null;
    const result: TiptapNode = { type: "text", text: node.text.slice(0, TIPTAP_MAX_TEXT_LENGTH) };
    const marks = sanitizeMarks(node.marks);
    if (marks) result.marks = marks;
    return result;
  }

  if (node.type === "image") {
    const attrs = sanitizeAttrs(node.attrs, NODE_ATTRS.image);
    if (!attrs?.src) return null; // image without a safe src is dropped
    return { type: "image", attrs };
  }

  const result: TiptapNode = { type: node.type };
  const attrs = sanitizeAttrs(node.attrs, NODE_ATTRS[node.type]);
  if (attrs) result.attrs = attrs;

  if (Array.isArray(node.content)) {
    const content: TiptapNode[] = [];
    for (const child of node.content) {
      const cleaned = sanitizeNode(child, depth + 1, budget);
      if (cleaned) content.push(cleaned);
    }
    if (content.length > 0) result.content = content;
  }
  return result;
}

/**
 * Returns a cleaned copy of the document. Never throws; anything not on the
 * whitelist (script-ish nodes, event-handler attrs, javascript: URLs, style, class, ...) is removed.
 */
export function sanitizeTiptapDoc(json: unknown): TiptapDoc {
  let value: unknown = json;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { type: "doc", content: [] };
    }
  }
  if (!isPlainObject(value) || !Array.isArray(value.content)) {
    return { type: "doc", content: [] };
  }
  const budget = { nodes: TIPTAP_MAX_NODES };
  const content: TiptapNode[] = [];
  for (const child of value.content) {
    const cleaned = sanitizeNode(child, 1, budget);
    if (cleaned) content.push(cleaned);
  }
  return { type: "doc", content };
}

// ── Plain text ───────────────────────────────────────────────────────────

/** Plain text (for SEO meta descriptions / search). Whitespace-collapsed, optionally truncated. */
export function tiptapToPlainText(json: unknown, maxLength?: number): string {
  const doc = sanitizeTiptapDoc(json);
  const parts: string[] = [];

  const walk = (node: TiptapNode): void => {
    if (node.type === "text") {
      parts.push(node.text ?? "");
      return;
    }
    if (node.type === "hardBreak") {
      parts.push(" ");
      return;
    }
    if (node.type === "image" || node.type === "horizontalRule") return;
    for (const child of node.content ?? []) walk(child);
    if (BLOCK_NODES.has(node.type)) parts.push(" ");
  };
  for (const node of doc.content) walk(node);

  const text = parts.join("").replace(/\s+/g, " ").trim();
  if (maxLength === undefined || text.length <= maxLength) return text;
  if (maxLength <= 1) return text.slice(0, maxLength);

  const cut = text.slice(0, maxLength - 1);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

export function isEmptyTiptapDoc(json: unknown): boolean {
  return tiptapToPlainText(json).length === 0 && !hasImage(sanitizeTiptapDoc(json).content);
}

function hasImage(nodes: TiptapNode[]): boolean {
  return nodes.some((n) => n.type === "image" || (n.content ? hasImage(n.content) : false));
}
