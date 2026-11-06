import type { PRODUCT_STATUSES } from "@/features/products/schema";

/** Client-safe shape of what the admin product form sends to the server actions. */
export interface ProductFormPayload {
  name: string;
  /** null/"" -> server generates a unique slug from the name (create only). */
  slug: string | null;
  /** Toman as typed by the admin; ""/null -> no price ("call us"). */
  price: string | null;
  stockQuantity: string;
  status: (typeof PRODUCT_STATUSES)[number];
  categoryIds: string[];
  /** Tiptap JSON document, or null. */
  description: unknown;
  /** Desired final image list in order; first one becomes the primary image. */
  images: Array<{ id?: string; storageKey: string; altText?: string | null }>;
}

export interface ProductSaveData {
  id: string;
  /** Set when the product saved but something secondary (images) failed. */
  warning?: string;
}
