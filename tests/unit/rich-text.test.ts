import { describe, expect, it } from "vitest";
import {
  sanitizeTiptapDoc,
  tiptapToPlainText,
  validateTiptapDoc,
} from "@/lib/rich-text";
import { safeRedirectPath } from "@/lib/safe-redirect";

describe("validateTiptapDoc", () => {
  it("accepts a valid doc", () => {
    const result = validateTiptapDoc({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "سلام" }] }],
    });
    expect(result.success).toBe(true);
  });

  it.each([null, "x", 5, [], { type: "paragraph" }, { type: "doc" }, { type: "doc", content: {} }])(
    "rejects invalid shape %j",
    (value) => {
      expect(validateTiptapDoc(value).success).toBe(false);
    },
  );

  it("rejects unknown node types such as script/iframe", () => {
    expect(
      validateTiptapDoc({ type: "doc", content: [{ type: "script", content: [] }] }).success,
    ).toBe(false);
  });
});

describe("sanitizeTiptapDoc", () => {
  it("strips javascript: links and unknown attrs, forces safe rel/target", () => {
    const doc = sanitizeTiptapDoc({
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { onclick: "alert(1)", style: "x" },
          content: [
            {
              type: "text",
              text: "bad",
              marks: [{ type: "link", attrs: { href: "java\nscript:alert(1)" } }],
            },
            {
              type: "text",
              text: "good",
              marks: [{ type: "link", attrs: { href: "https://example.com", target: "_self", rel: "x" } }],
            },
          ],
        },
      ],
    });
    const paragraph = doc.content[0]!;
    expect(paragraph.attrs).toBeUndefined();
    const [bad, good] = paragraph.content!;
    expect(bad!.marks).toBeUndefined();
    expect(good!.marks![0]!.attrs).toEqual({
      href: "https://example.com",
      target: "_blank",
      rel: "noopener noreferrer nofollow",
    });
  });

  it("drops images with unsafe src and script nodes", () => {
    const doc = sanitizeTiptapDoc({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "javascript:alert(1)" } },
        { type: "image", attrs: { src: "data:text/html;base64,AAAA" } },
        { type: "script", content: [{ type: "text", text: "alert(1)" }] },
        { type: "image", attrs: { src: "https://cdn.example.com/a.png", alt: "x", onerror: "boom" } },
      ],
    });
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]!.attrs).toEqual({ src: "https://cdn.example.com/a.png", alt: "x" });
  });

  it("never throws on garbage", () => {
    expect(sanitizeTiptapDoc(undefined)).toEqual({ type: "doc", content: [] });
    expect(sanitizeTiptapDoc("not json")).toEqual({ type: "doc", content: [] });
  });
});

describe("tiptapToPlainText", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "عنوان" }] },
      {
        type: "paragraph",
        content: [
          { type: "text", text: "متن اول" },
          { type: "hardBreak" },
          { type: "text", text: "متن دوم" },
        ],
      },
    ],
  };

  it("joins blocks with spaces", () => {
    expect(tiptapToPlainText(doc)).toBe("عنوان متن اول متن دوم");
  });

  it("truncates with an ellipsis", () => {
    const out = tiptapToPlainText(doc, 10);
    expect(out.length).toBeLessThanOrEqual(10);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("safeRedirectPath", () => {
  it("allows internal paths only", () => {
    expect(safeRedirectPath("/admin/products?x=1")).toBe("/admin/products?x=1");
    expect(safeRedirectPath("//evil.com")).toBe("/");
    expect(safeRedirectPath("https://evil.com")).toBe("/");
    expect(safeRedirectPath("/\\evil.com")).toBe("/");
    expect(safeRedirectPath(null)).toBe("/");
  });
});
