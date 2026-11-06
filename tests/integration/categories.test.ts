import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import {
  createCategory,
  deleteCategory,
  getDescendantIds,
  listCategoryTree,
  moveCategory,
  reorderCategories,
  updateCategory,
} from "@/features/categories/service";
import { listProducts, setProductCategories } from "@/features/products/service";
import { makeProductRow, rejection } from "./helpers/factories";

async function chain(depth: number, prefix = "level") {
  const created = [];
  let parentId: string | null = null;
  for (let i = 1; i <= depth; i++) {
    const category = await createCategory({ name: `${prefix} ${i}`, parentId });
    created.push(category);
    parentId = category.id;
  }
  return created;
}

async function expectServiceError(promise: Promise<unknown>, code: ServiceError["code"]) {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ServiceError);
  expect((error as ServiceError).code).toBe(code);
}

describe("category hierarchy", () => {
  it("supports nesting 7 levels deep and exposes it in the tree and descendants", async () => {
    const levels = await chain(7);
    expect(levels).toHaveLength(7);
    expect(levels[6].parentId).toBe(levels[5].id);

    let nodes = await listCategoryTree();
    for (let depth = 0; depth < 7; depth++) {
      expect(nodes).toHaveLength(1);
      expect(nodes[0].id).toBe(levels[depth].id);
      nodes = nodes[0].children;
    }
    expect(nodes).toHaveLength(0);

    const descendants = await getDescendantIds(levels[0].id);
    expect(new Set(descendants)).toEqual(new Set(levels.slice(1).map((l) => l.id)));
  });

  it("generates unique slugs for duplicate names and rejects an explicit duplicate slug", async () => {
    const a = await createCategory({ name: "Shoes" });
    const b = await createCategory({ name: "Shoes" });
    expect(a.slug).not.toBe(b.slug);
    await expectServiceError(createCategory({ name: "Other", slug: a.slug }), "CONFLICT");
  });

  it("rejects an unknown parent", async () => {
    await expectServiceError(createCategory({ name: "Orphan", parentId: "nope" }), "NOT_FOUND");
  });

  it("rejects making a category its own parent", async () => {
    const [root] = await chain(1);
    await expectServiceError(moveCategory({ id: root.id, newParentId: root.id }), "VALIDATION");
  });

  it("rejects moving a category under its own descendant (direct and deep)", async () => {
    const levels = await chain(4);
    await expectServiceError(
      moveCategory({ id: levels[0].id, newParentId: levels[1].id }),
      "VALIDATION",
    );
    await expectServiceError(
      moveCategory({ id: levels[0].id, newParentId: levels[3].id }),
      "VALIDATION",
    );
    await expectServiceError(
      moveCategory({ id: levels[1].id, newParentId: levels[3].id }),
      "VALIDATION",
    );
    // Tree is untouched by the failed moves.
    const rows = await prisma.category.findMany({ orderBy: { name: "asc" } });
    expect(rows.map((r) => r.parentId)).toEqual([null, levels[0].id, levels[1].id, levels[2].id]);
  });

  it("allows a valid move, keeps products attached, and moves the whole subtree", async () => {
    const [a, a1, a2] = await chain(3, "a");
    const b = await createCategory({ name: "b root" });
    const product = await makeProductRow({ categoryIds: [a2.id] });

    const moved = await moveCategory({ id: a1.id, newParentId: b.id });
    expect(moved.parentId).toBe(b.id);

    const links = await prisma.productCategory.findMany({ where: { productId: product.id } });
    expect(links.map((l) => l.categoryId)).toEqual([a2.id]);
    expect(new Set(await getDescendantIds(b.id))).toEqual(new Set([a1.id, a2.id]));
    expect(await getDescendantIds(a.id)).toEqual([]);

    // Moving to the root works too.
    const root = await moveCategory({ id: a2.id, newParentId: null });
    expect(root.parentId).toBeNull();
  });

  it("rejects moving to a missing parent or moving a missing category", async () => {
    const [a] = await chain(1);
    await expectServiceError(moveCategory({ id: a.id, newParentId: "missing" }), "NOT_FOUND");
    await expectServiceError(moveCategory({ id: "missing", newParentId: null }), "NOT_FOUND");
  });

  it("concurrent opposite moves cannot jointly create a cycle", async () => {
    const x = await createCategory({ name: "x" });
    const y = await createCategory({ name: "y" });
    const results = await Promise.allSettled([
      moveCategory({ id: x.id, newParentId: y.id }),
      moveCategory({ id: y.id, newParentId: x.id }),
    ]);
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);

    const rows = await prisma.category.findMany();
    const byId = new Map(rows.map((r) => [r.id, r.parentId]));
    // Walk up from each node: must terminate at a root within N steps.
    for (const row of rows) {
      let current: string | null = row.id;
      let steps = 0;
      while (current !== null && steps <= rows.length) {
        current = byId.get(current) ?? null;
        steps++;
      }
      expect(current).toBeNull();
    }
  });

  it("reorders siblings and rejects a mismatching list", async () => {
    const a = await createCategory({ name: "a" });
    const b = await createCategory({ name: "b" });
    const c = await createCategory({ name: "c" });
    await reorderCategories({ parentId: null, orderedIds: [c.id, a.id, b.id] });
    const rows = await prisma.category.findMany({ orderBy: { sortOrder: "asc" } });
    expect(rows.map((r) => r.id)).toEqual([c.id, a.id, b.id]);

    await expectServiceError(reorderCategories({ parentId: null, orderedIds: [a.id, b.id] }), "VALIDATION");
    await expectServiceError(
      reorderCategories({ parentId: null, orderedIds: [a.id, a.id, b.id] }),
      "VALIDATION",
    );
  });

  it("update keeps slug uniqueness", async () => {
    const a = await createCategory({ name: "a" });
    const b = await createCategory({ name: "b" });
    await expectServiceError(updateCategory(b.id, { slug: a.slug }), "CONFLICT");
    const updated = await updateCategory(b.id, { name: "bee", slug: "bee" });
    expect(updated).toMatchObject({ name: "bee", slug: "bee" });
  });
});

describe("category deletion", () => {
  it("blocks deleting a category with children by default and changes nothing", async () => {
    const [parent, child] = await chain(2);
    await expectServiceError(deleteCategory(parent.id), "CONFLICT");
    expect(await prisma.category.count()).toBe(2);
    expect((await prisma.category.findUniqueOrThrow({ where: { id: child.id } })).parentId).toBe(parent.id);
  });

  it("promote-children moves children to the deleted category's parent", async () => {
    const [root, middle, leaf] = await chain(3);
    const sibling = await createCategory({ name: "sibling", parentId: middle.id });

    await deleteCategory(middle.id, "promote-children");

    expect(await prisma.category.findUnique({ where: { id: middle.id } })).toBeNull();
    const leafRow = await prisma.category.findUniqueOrThrow({ where: { id: leaf.id } });
    const siblingRow = await prisma.category.findUniqueOrThrow({ where: { id: sibling.id } });
    expect(leafRow.parentId).toBe(root.id);
    expect(siblingRow.parentId).toBe(root.id);
  });

  it("promote-children on a root category promotes its children to roots", async () => {
    const [root, child] = await chain(2);
    await deleteCategory(root.id, "promote-children");
    expect((await prisma.category.findUniqueOrThrow({ where: { id: child.id } })).parentId).toBeNull();
  });

  it("deleting a category leaves its products intact", async () => {
    const [category] = await chain(1);
    const other = await createCategory({ name: "other" });
    const product = await makeProductRow({ categoryIds: [category.id, other.id] });

    await deleteCategory(category.id);

    const survivor = await prisma.product.findUnique({
      where: { id: product.id },
      include: { categories: true },
    });
    expect(survivor).not.toBeNull();
    expect(survivor!.categories.map((c) => c.categoryId)).toEqual([other.id]);
  });

  it("rejects an unknown id and an invalid strategy", async () => {
    await expectServiceError(deleteCategory("missing"), "NOT_FOUND");
    const [category] = await chain(1);
    await expectServiceError(
      deleteCategory(category.id, "cascade" as unknown as "block"),
      "VALIDATION",
    );
  });
});

describe("products in categories", () => {
  it("a product can belong to multiple categories", async () => {
    const a = await createCategory({ name: "a" });
    const b = await createCategory({ name: "b" });
    const product = await makeProductRow();
    await setProductCategories(product.id, [a.id, b.id, a.id]);

    const links = await prisma.productCategory.findMany({ where: { productId: product.id } });
    expect(links.map((l) => l.categoryId).sort()).toEqual([a.id, b.id].sort());

    expect((await listProducts({ categoryId: a.id })).items.map((p) => p.id)).toEqual([product.id]);
    expect((await listProducts({ categoryId: b.id })).items.map((p) => p.id)).toEqual([product.id]);
  });

  it("rejects assigning a nonexistent category", async () => {
    const product = await makeProductRow();
    await expectServiceError(setProductCategories(product.id, ["missing"]), "VALIDATION");
  });

  it("category filter includes descendants without duplicating products", async () => {
    const [root, child, grandchild] = await chain(3);
    const unrelated = await createCategory({ name: "unrelated" });

    const inRoot = await makeProductRow({ name: "in root", categoryIds: [root.id] });
    const inChild = await makeProductRow({ name: "in child", categoryIds: [child.id] });
    // Linked to root AND to its descendants: must still appear exactly once.
    const inAll = await makeProductRow({
      name: "in all",
      categoryIds: [root.id, child.id, grandchild.id],
    });
    const elsewhere = await makeProductRow({ name: "elsewhere", categoryIds: [unrelated.id] });
    const nowhere = await makeProductRow({ name: "nowhere" });

    const page = await listProducts({ categoryId: root.id });
    const ids = page.items.map((p) => p.id);
    expect(page.total).toBe(3);
    expect(ids).toHaveLength(3);
    expect(new Set(ids)).toEqual(new Set([inRoot.id, inChild.id, inAll.id]));
    expect(ids).not.toContain(elsewhere.id);
    expect(ids).not.toContain(nowhere.id);

    // Filtering by a leaf only returns products in that leaf.
    expect((await listProducts({ categoryId: grandchild.id })).items.map((p) => p.id)).toEqual([inAll.id]);
  });

  it("category filter pagination stays consistent for multi-linked products", async () => {
    const [root, child] = await chain(2);
    for (let i = 0; i < 5; i++) {
      await makeProductRow({ categoryIds: [root.id, child.id] });
    }
    const first = await listProducts({ categoryId: root.id, pageSize: 3, page: 1 });
    const second = await listProducts({ categoryId: root.id, pageSize: 3, page: 2 });
    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(2);
    const all = [...first.items, ...second.items].map((p) => p.id);
    expect(new Set(all).size).toBe(5);
  });
});
