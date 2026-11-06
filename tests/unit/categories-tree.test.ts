import { describe, expect, it } from "vitest";
import {
  buildCategoryPath,
  buildCategoryTree,
  buildChildrenIndex,
  collectDescendantIds,
  wouldCreateCycle,
  type FlatCategory,
} from "@/features/categories/tree";

function cat(id: string, parentId: string | null, sortOrder = 0): FlatCategory {
  return {
    id,
    name: `cat-${id}`,
    slug: id,
    description: null,
    imageKey: null,
    imageUrl: null,
    parentId,
    sortOrder,
  };
}

//  a
//  ├─ b
//  │  └─ d
//  │     └─ e
//  └─ c
//  x
const categories: FlatCategory[] = [
  cat("a", null, 0),
  cat("b", "a", 0),
  cat("c", "a", 1),
  cat("d", "b", 0),
  cat("e", "d", 0),
  cat("x", null, 1),
];

describe("wouldCreateCycle", () => {
  it("rejects making a category its own parent", () => {
    expect(wouldCreateCycle(categories, "a", "a")).toBe(true);
  });

  it("rejects moving a category under its direct child", () => {
    expect(wouldCreateCycle(categories, "a", "b")).toBe(true);
  });

  it("rejects moving a category under a deep descendant", () => {
    expect(wouldCreateCycle(categories, "a", "e")).toBe(true);
    expect(wouldCreateCycle(categories, "b", "e")).toBe(true);
  });

  it("allows valid moves", () => {
    expect(wouldCreateCycle(categories, "e", "a")).toBe(false);
    expect(wouldCreateCycle(categories, "d", "x")).toBe(false);
    expect(wouldCreateCycle(categories, "c", "b")).toBe(false);
  });

  it("allows moving to root", () => {
    expect(wouldCreateCycle(categories, "d", null)).toBe(false);
  });
});

describe("collectDescendantIds", () => {
  it("returns all descendants breadth-first, excluding the root", () => {
    const index = buildChildrenIndex(categories);
    expect(collectDescendantIds(index, "a")).toEqual(["b", "c", "d", "e"]);
    expect(collectDescendantIds(index, "d")).toEqual(["e"]);
    expect(collectDescendantIds(index, "e")).toEqual([]);
  });

  it("terminates on corrupt cyclic data", () => {
    const cyclic = [cat("p", "q"), cat("q", "p")];
    const index = buildChildrenIndex(cyclic);
    expect(collectDescendantIds(index, "p").sort()).toEqual(["q"]);
  });
});

describe("buildCategoryTree", () => {
  it("builds nested tree sorted by sortOrder", () => {
    const tree = buildCategoryTree([...categories].reverse());
    expect(tree.map((n) => n.id)).toEqual(["a", "x"]);
    expect(tree[0]!.children.map((n) => n.id)).toEqual(["b", "c"]);
    expect(tree[0]!.children[0]!.children[0]!.children[0]!.id).toBe("e");
  });

  it("treats orphans as roots", () => {
    const tree = buildCategoryTree([cat("o", "missing")]);
    expect(tree.map((n) => n.id)).toEqual(["o"]);
  });
});

describe("buildCategoryPath", () => {
  it("returns ancestors from root to the category", () => {
    expect(buildCategoryPath(categories, "e").map((c) => c.id)).toEqual(["a", "b", "d", "e"]);
    expect(buildCategoryPath(categories, "a").map((c) => c.id)).toEqual(["a"]);
    expect(buildCategoryPath(categories, "nope")).toEqual([]);
  });
});
