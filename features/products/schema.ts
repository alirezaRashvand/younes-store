import { z } from "zod";
import { fromPersianDigits } from "@/lib/format";
import { SLUG_REGEX } from "@/lib/slug";
import { validateTiptapDoc } from "@/lib/rich-text";
import { LOW_STOCK_THRESHOLD, MAX_PRODUCT_IMAGES } from "@/features/products/constants";

export const PRODUCT_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;
export const productStatusSchema = z.enum(PRODUCT_STATUSES, {
  error: "وضعیت محصول نامعتبر است.",
});

export { LOW_STOCK_THRESHOLD, MAX_PRODUCT_IMAGES };
export const MAX_STOCK = 1_000_000;
export const MAX_PRICE = BigInt(Number.MAX_SAFE_INTEGER);

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

const idSchema = z.string().min(1, "شناسه نامعتبر است.").max(64, "شناسه نامعتبر است.");

/**
 * Price in Toman. Accepts bigint | integer number | numeric string (Persian digits and
 * thousands separators allowed) | null/"" (no price → "call us"). Rejects negatives.
 */
export const priceSchema = z
  .union([z.bigint(), z.number(), z.string(), z.null()])
  .transform((value, ctx): bigint | null => {
    if (value === null) return null;

    let result: bigint;
    if (typeof value === "bigint") {
      result = value;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value) || !Number.isInteger(value)) {
        ctx.addIssue({ code: "custom", message: "قیمت باید عدد صحیح باشد." });
        return z.NEVER;
      }
      result = BigInt(value);
    } else {
      const cleaned = fromPersianDigits(value).replace(/[,٬،\s]/g, "");
      if (cleaned === "") return null;
      if (!/^-?\d+$/.test(cleaned)) {
        ctx.addIssue({ code: "custom", message: "قیمت باید عدد صحیح باشد." });
        return z.NEVER;
      }
      result = BigInt(cleaned);
    }

    if (result < BigInt(0)) {
      ctx.addIssue({ code: "custom", message: "قیمت نمی‌تواند منفی باشد." });
      return z.NEVER;
    }
    if (result > MAX_PRICE) {
      ctx.addIssue({ code: "custom", message: "قیمت واردشده بیش از حد بزرگ است." });
      return z.NEVER;
    }
    return result;
  });

export const stockSchema = z
  .union([z.number(), z.string()])
  .transform((value, ctx): number => {
    const n =
      typeof value === "number"
        ? value
        : Number(fromPersianDigits(value).replace(/[,٬،\s]/g, ""));
    if (!Number.isFinite(n) || !Number.isInteger(n)) {
      ctx.addIssue({ code: "custom", message: "موجودی باید عدد صحیح باشد." });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({ code: "custom", message: "موجودی نمی‌تواند منفی باشد." });
      return z.NEVER;
    }
    if (n > MAX_STOCK) {
      ctx.addIssue({ code: "custom", message: "موجودی واردشده بیش از حد بزرگ است." });
      return z.NEVER;
    }
    return n;
  });

/** Validated + sanitized Tiptap JSON document; an empty document becomes null. */
export const descriptionSchema = z
  .unknown()
  .transform((value, ctx) => {
    if (value === undefined || value === null) return null;
    const result = validateTiptapDoc(value);
    if (!result.success) {
      ctx.addIssue({ code: "custom", message: result.error });
      return z.NEVER;
    }
    return result.doc.content.length === 0 ? null : result.doc;
  })
  .nullable()
  .optional();

const nameSchema = z
  .string({ error: "نام محصول را وارد کنید." })
  .trim()
  .min(1, "نام محصول را وارد کنید.")
  .max(200, "نام محصول نباید بیش از ۲۰۰ حرف باشد.");

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "نامک نمی‌تواند خالی باشد.")
  .max(120, "نامک نباید بیش از ۱۲۰ حرف باشد.")
  .regex(SLUG_REGEX, "نامک فقط می‌تواند شامل حروف، اعداد و خط تیره باشد.");

const categoryIdsSchema = z
  .array(idSchema)
  .max(20, "حداکثر ۲۰ دسته‌بندی قابل انتخاب است.")
  .transform((ids) => Array.from(new Set(ids)));

export const createProductSchema = z.object({
  name: nameSchema,
  slug: z.preprocess(emptyToNull, slugSchema.nullable().optional()),
  price: priceSchema.optional(),
  stockQuantity: stockSchema.optional(),
  description: descriptionSchema,
  status: productStatusSchema.optional(),
  categoryIds: categoryIdsSchema.optional(),
});

export const updateProductSchema = z.object({
  name: nameSchema.optional(),
  slug: slugSchema.optional(),
  price: priceSchema.optional(),
  stockQuantity: stockSchema.optional(),
  description: descriptionSchema,
  status: productStatusSchema.optional(),
  categoryIds: categoryIdsSchema.optional(),
});

export const setCategoriesSchema = z.object({
  productId: idSchema,
  categoryIds: categoryIdsSchema,
});

export const addProductImageSchema = z.object({
  productId: idSchema,
  storageKey: z.string().min(1, "کلید فایل نامعتبر است.").max(200, "کلید فایل نامعتبر است."),
  altText: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, "متن جایگزین تصویر طولانی است.").nullable().optional(),
  ),
});

export const PRODUCT_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "name",
  "price",
  "stockQuantity",
] as const;

export const STOCK_FILTERS = ["in_stock", "out_of_stock", "low_stock"] as const;

/**
 * Optional price-range bound from a query string. Accepts Persian digits and
 * separators; anything invalid (or negative) is silently ignored.
 */
const priceBoundSchema = z
  .union([z.string(), z.number(), z.bigint()])
  .transform((value): bigint | undefined => {
    if (typeof value === "bigint") return value >= BigInt(0) ? value : undefined;
    const cleaned =
      typeof value === "number"
        ? String(value)
        : fromPersianDigits(value).replace(/[,٬،\s]/g, "");
    if (!/^\d{1,15}$/.test(cleaned)) return undefined;
    return BigInt(cleaned);
  })
  .optional()
  .catch(undefined);

/** Resilient to bad query-string values: anything invalid falls back to defaults. */
export const listProductsSchema = z.object({
  search: z.string().trim().max(100).optional().catch(undefined),
  categoryId: idSchema.optional().catch(undefined),
  minPrice: priceBoundSchema,
  maxPrice: priceBoundSchema,
  status: productStatusSchema.optional().catch(undefined),
  stock: z.enum(STOCK_FILTERS).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  pageSize: z.coerce.number().int().min(1).max(100).catch(20),
  sortBy: z.enum(PRODUCT_SORT_FIELDS).catch("createdAt"),
  sortDir: z.enum(["asc", "desc"]).catch("desc"),
});

export type CreateProductInput = z.input<typeof createProductSchema>;
export type UpdateProductInput = z.input<typeof updateProductSchema>;
export type ListProductsParams = z.output<typeof listProductsSchema>;
/** Raw (e.g. searchParams) input: every key optional, values validated by the schema. */
export type ListProductsInput = {
  [K in keyof ListProductsParams]?: ListProductsParams[K] | string | undefined;
};
export type AddProductImageInput = z.input<typeof addProductImageSchema>;

// ── Admin form payload ───────────────────────────────────────────────────

/** One image in the desired final list. Entries without `id` are newly uploaded. */
export const productImageInputSchema = z.object({
  id: idSchema.optional(),
  storageKey: z.string().min(1, "کلید فایل نامعتبر است.").max(200, "کلید فایل نامعتبر است."),
  altText: z.preprocess(
    emptyToNull,
    z.string().trim().max(300, "متن جایگزین تصویر طولانی است.").nullable().optional(),
  ),
});

export const productImagesInputSchema = z
  .array(productImageInputSchema)
  .max(MAX_PRODUCT_IMAGES, `حداکثر ${MAX_PRODUCT_IMAGES} تصویر برای هر محصول مجاز است.`);

/** Everything the admin product form submits (create and edit). */
export const productFormSchema = createProductSchema.extend({
  images: productImagesInputSchema.default([]),
});

export type ProductImageInput = z.input<typeof productImageInputSchema>;
export type ProductFormInput = z.input<typeof productFormSchema>;
