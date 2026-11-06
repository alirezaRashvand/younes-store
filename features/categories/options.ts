import type { CategoryNode } from "@/features/categories/tree";

export interface CategoryOption {
  id: string;
  name: string;
  /** "Parent › Child" */
  label: string;
  depth: number;
}

/**
 * Depth-first flattening of the tree (already sorted) into select options.
 * Pass `excludeSubtreeOf` to leave out a category and all its descendants
 * (e.g. the parent picker while editing, so cycles can't even be chosen).
 */
export function flattenCategoryOptions(
  tree: ReadonlyArray<CategoryNode>,
  excludeSubtreeOf?: string,
): CategoryOption[] {
  const out: CategoryOption[] = [];
  const walk = (nodes: ReadonlyArray<CategoryNode>, trail: string[]) => {
    for (const node of nodes) {
      if (node.id === excludeSubtreeOf) continue;
      const names = [...trail, node.name];
      out.push({ id: node.id, name: node.name, label: names.join(" › "), depth: trail.length });
      walk(node.children, names);
    }
  };
  walk(tree, []);
  return out;
}
