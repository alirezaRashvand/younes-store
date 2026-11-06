import { z } from "zod";
import { SLUG_REGEX } from "@/lib/slug";

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

export const categoryNameSchema = z
  .string({ error: "نام دسته‌بندی را وارد کنید." })
  .trim()
  .min(1, "نام دسته‌بندی را وارد کنید.")
  .max(100, "نام دسته‌بندی نباید بیش از ۱۰۰ حرف باشد.");

export const categorySlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "نامک نمی‌تواند خالی باشد.")
  .max(120, "نامک نباید بیش از ۱۲۰ حرف باشد.")
  .regex(SLUG_REGEX, "نامک فقط می‌تواند شامل حروف، اعداد و خط تیره باشد.");

const optionalText = (max: number, message: string) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, message).nullable().optional());

const storageKeySchema = z.preprocess(
  emptyToNull,
  z.string().max(300).regex(/^[a-zA-Z0-9/_.-]+$/, "کلید فایل نامعتبر است.").nullable().optional(),
);

const imageUrlSchema = z.preprocess(
  emptyToNull,
  z
    .url({ message: "نشانی تصویر نامعتبر است." })
    .max(2000)
    .refine((u) => /^https?:\/\//i.test(u), "نشانی تصویر نامعتبر است.")
    .nullable()
    .optional(),
);

export const idSchema = z.string().min(1, "شناسه نامعتبر است.").max(64, "شناسه نامعتبر است.");

export const createCategorySchema = z.object({
  name: categoryNameSchema,
  slug: z.preprocess(emptyToNull, categorySlugSchema.nullable().optional()),
  description: optionalText(1000, "توضیحات نباید بیش از ۱۰۰۰ حرف باشد."),
  imageKey: storageKeySchema,
  imageUrl: imageUrlSchema,
  parentId: z.preprocess(emptyToNull, idSchema.nullable().optional()),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

/** Parent changes go through moveCategory(). */
export const updateCategorySchema = z.object({
  name: categoryNameSchema.optional(),
  slug: categorySlugSchema.optional(),
  description: optionalText(1000, "توضیحات نباید بیش از ۱۰۰۰ حرف باشد."),
  imageKey: storageKeySchema,
  imageUrl: imageUrlSchema,
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

export const moveCategorySchema = z.object({
  id: idSchema,
  newParentId: z.preprocess(emptyToNull, idSchema.nullable()),
  sortOrder: z.number().int().min(0).max(1_000_000).optional(),
});

export const deleteCategoryStrategySchema = z.enum(["block", "promote-children"]);

export const reorderCategoriesSchema = z.object({
  parentId: z.preprocess(emptyToNull, idSchema.nullable()),
  orderedIds: z.array(idSchema).min(1).max(1000),
});

export type CreateCategoryInput = z.input<typeof createCategorySchema>;
export type UpdateCategoryInput = z.input<typeof updateCategorySchema>;
export type MoveCategoryInput = z.input<typeof moveCategorySchema>;
export type DeleteCategoryStrategy = z.infer<typeof deleteCategoryStrategySchema>;
export type ReorderCategoriesInput = z.input<typeof reorderCategoriesSchema>;
