/** Pure category-tree helpers (no DB access) so they are cheap to unit test. */

export interface FlatCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageKey: string | null;
  imageUrl: string | null;
  parentId: string | null;
  sortOrder: number;
}

export interface CategoryNode extends FlatCategory {
  children: CategoryNode[];
}

function compareCategories(a: FlatCategory, b: FlatCategory): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  return a.name.localeCompare(b.name, "fa");
}

/** id -> direct child ids */
export function buildChildrenIndex(
  categories: ReadonlyArray<Pick<FlatCategory, "id" | "parentId">>,
): Map<string, string[]> {
  const index = new Map<string, string[]>();
  for (const c of categories) {
    if (c.parentId === null) continue;
    const list = index.get(c.parentId);
    if (list) list.push(c.id);
    else index.set(c.parentId, [c.id]);
  }
  return index;
}

/** O(n) tree construction from a flat list. Orphans (missing parent) become roots. */
export function buildCategoryTree(categories: ReadonlyArray<FlatCategory>): CategoryNode[] {
  const nodes = new Map<string, CategoryNode>();
  for (const c of categories) nodes.set(c.id, { ...c, children: [] });

  const roots: CategoryNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRecursive = (list: CategoryNode[]) => {
    list.sort(compareCategories);
    for (const n of list) sortRecursive(n.children);
  };
  sortRecursive(roots);
  return roots;
}

/** BFS over the in-memory children index. Returns descendants only (not the root id). */
export function collectDescendantIds(
  childrenIndex: ReadonlyMap<string, string[]>,
  categoryId: string,
): string[] {
  const result: string[] = [];
  const visited = new Set<string>([categoryId]);
  const queue: string[] = [categoryId];
  for (let head = 0; head < queue.length; head++) {
    const current = queue[head]!;
    for (const childId of childrenIndex.get(current) ?? []) {
      if (visited.has(childId)) continue; // guards against corrupt cyclic data
      visited.add(childId);
      result.push(childId);
      queue.push(childId);
    }
  }
  return result;
}

/** Ancestors ordered root -> ... -> category (the category itself is last). */
export function buildCategoryPath(
  categories: ReadonlyArray<FlatCategory>,
  categoryId: string,
): FlatCategory[] {
  const byId = new Map(categories.map((c) => [c.id, c] as const));
  const path: FlatCategory[] = [];
  const seen = new Set<string>();
  let current = byId.get(categoryId);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

/**
 * True if making `newParentId` the parent of `categoryId` would be invalid:
 * the category becoming its own parent, or being moved under one of its descendants.
 */
export function wouldCreateCycle(
  categories: ReadonlyArray<Pick<FlatCategory, "id" | "parentId">>,
  categoryId: string,
  newParentId: string | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === categoryId) return true;
  const descendants = collectDescendantIds(buildChildrenIndex(categories), categoryId);
  return descendants.includes(newParentId);
}
