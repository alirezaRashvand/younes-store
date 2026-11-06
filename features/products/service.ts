import "server-only";

import { prisma } from "@/lib/db";
import { Prisma, PublicationStatus } from "@/generated/prisma/client";
import { isUniqueViolation, parseOrThrow, ServiceError } from "@/lib/errors";
import { normalizePersianText } from "@/lib/format";
import { ensureUniqueSlug } from "@/lib/slug";
import {
  StorageError,
  assertValidUploadedObject,
  buildPublicUrl,
  deleteObject,
  isS3Configured,
  isValidStorageKey,
} from "@/lib/storage/s3";
import { getDescendantIds } from "@/features/categories/service";
import {
  LOW_STOCK_THRESHOLD,
  MAX_PRODUCT_IMAGES,
  addProductImageSchema,
  createProductSchema,
  listProductsSchema,
  setCategoriesSchema,
  updateProductSchema,
  type AddProductImageInput,
  type CreateProductInput,
  type ListProductsInput,
  type UpdateProductInput,
} from "@/features/products/schema";

const MSG = {
  notFound: "محصول یافت نشد.",
  imageNotFound: "تصویر یافت نشد.",
  slugTaken: "این نامک قبلاً برای محصول دیگری استفاده شده است.",
  categoriesMissing: "یک یا چند دسته‌بندی انتخاب‌شده وجود ندارد.",
  tooManyImages: `حداکثر ${MAX_PRODUCT_IMAGES} تصویر برای هر محصول مجاز است.`,
  imageMismatch: "فهرست تصاویر با تصاویر موجود هم‌خوانی ندارد.",
  badImageKey: "کلید تصویر نامعتبر است.",
  duplicateImage: "این تصویر قبلاً اضافه شده است.",
  storageUnavailable: "ذخیره‌سازی فایل پیکربندی نشده است.",
} as const;

type Tx = Prisma.TransactionClient;

// ── Selects / types ──────────────────────────────────────────────────────

const listSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  stockQuantity: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
  images: {
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
    take: 1,
    select: { id: true, url: true, altText: true },
  },
} satisfies Prisma.ProductSelect;

const detailSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  stockQuantity: true,
  description: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  categories: { select: { category: { select: { id: true, name: true, slug: true } } } },
  images: {
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      url: true,
      storageKey: true,
      altText: true,
      sortOrder: true,
      isPrimary: true,
    },
  },
} satisfies Prisma.ProductSelect;

export type ProductListItem = Prisma.ProductGetPayload<{ select: typeof listSelect }>;
export type ProductDetail = Prisma.ProductGetPayload<{ select: typeof detailSelect }>;

export interface ProductPage {
  items: ProductListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function decodeSlug(slug: string): string {
  try {
    return decodeURIComponent(slug).toLowerCase();
  } catch {
    return slug.toLowerCase();
  }
}

async function assertCategoriesExist(tx: Tx, categoryIds: string[]): Promise<void> {
  if (categoryIds.length === 0) return;
  const count = await tx.category.count({ where: { id: { in: categoryIds } } });
  if (count !== categoryIds.length) {
    throw new ServiceError("VALIDATION", MSG.categoriesMissing);
  }
}

async function replaceCategories(
  tx: Tx,
  productId: string,
  categoryIds: string[],
): Promise<void> {
  await assertCategoriesExist(tx, categoryIds);
  await tx.productCategory.deleteMany({ where: { productId } });
  if (categoryIds.length > 0) {
    await tx.productCategory.createMany({
      data: categoryIds.map((categoryId) => ({ productId, categoryId })),
    });
  }
}

function descriptionData(
  description: unknown,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  return description === null || description === undefined
    ? Prisma.DbNull
    : (description as Prisma.InputJsonValue);
}

async function bestEffortDeleteObjects(keys: string[]): Promise<void> {
  if (keys.length === 0 || !isS3Configured()) return;
  await Promise.allSettled(keys.map((key) => deleteObject(key)));
}

// ── Reads ────────────────────────────────────────────────────────────────

async function queryProducts(
  params: ReturnType<typeof listProductsSchema.parse>,
  forcedStatus?: PublicationStatus,
): Promise<ProductPage> {
  const where: Prisma.ProductWhereInput = {};

  const status = forcedStatus ?? params.status;
  if (status) where.status = status;

  const search = params.search?.trim();
  if (search) {
    const variants = Array.from(new Set([search, normalizePersianText(search)]));
    where.OR = variants.flatMap((term) => [
      { name: { contains: term, mode: "insensitive" as const } },
      { slug: { contains: term.replace(/\s+/g, "-"), mode: "insensitive" as const } },
    ]);
  }

  if (params.categoryId) {
    const ids = [params.categoryId, ...(await getDescendantIds(params.categoryId))];
    where.categories = { some: { categoryId: { in: ids } } };
  }

  if (params.minPrice !== undefined || params.maxPrice !== undefined) {
    // Products without a price never match a price range.
    where.price = {
      ...(params.minPrice !== undefined && { gte: params.minPrice }),
      ...(params.maxPrice !== undefined && { lte: params.maxPrice }),
    };
  }

  if (params.stock === "in_stock") where.stockQuantity = { gt: 0 };
  else if (params.stock === "out_of_stock") where.stockQuantity = { lte: 0 };
  else if (params.stock === "low_stock") {
    where.stockQuantity = { gt: 0, lte: LOW_STOCK_THRESHOLD };
  }

  const direction = params.sortDir;
  const primarySort: Prisma.ProductOrderByWithRelationInput =
    params.sortBy === "price"
      ? { price: { sort: direction, nulls: "last" } }
      : { [params.sortBy]: direction };

  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      select: listSelect,
      orderBy: [primarySort, { id: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
  ]);

  return {
    items,
    total,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: Math.max(1, Math.ceil(total / params.pageSize)),
  };
}

/** Admin listing: all statuses, with search / category / status / stock filters. */
export async function listProducts(input: ListProductsInput = {}): Promise<ProductPage> {
  return queryProducts(listProductsSchema.parse(input));
}

/** Storefront listing: PUBLISHED only (any `status` in input is ignored). */
export async function listPublishedProducts(input: ListProductsInput = {}): Promise<ProductPage> {
  return queryProducts(listProductsSchema.parse(input), PublicationStatus.PUBLISHED);
}

/** Public: only PUBLISHED products are visible. */
export async function getProductBySlug(slug: string): Promise<ProductDetail | null> {
  if (!slug) return null;
  return prisma.product.findFirst({
    where: { slug: decodeSlug(slug), status: PublicationStatus.PUBLISHED },
    select: detailSelect,
  });
}

/**
 * Public: published products sharing at least one category with `categoryIds`
 * (direct links only), excluding `productId`. Newest first.
 */
export async function listRelatedPublishedProducts(
  productId: string,
  categoryIds: string[],
  limit = 4,
): Promise<ProductListItem[]> {
  if (categoryIds.length === 0) return [];
  return prisma.product.findMany({
    where: {
      id: { not: productId },
      status: PublicationStatus.PUBLISHED,
      categories: { some: { categoryId: { in: categoryIds } } },
    },
    select: listSelect,
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: Math.min(Math.max(limit, 1), 24),
  });
}

/** Public (sitemap): slugs + last-modified of PUBLISHED products only. */
export async function listPublishedProductSitemapEntries(): Promise<
  Array<{ slug: string; updatedAt: Date }>
> {
  return prisma.product.findMany({
    where: { status: PublicationStatus.PUBLISHED },
    select: { slug: true, updatedAt: true },
    orderBy: { updatedAt: "desc" },
    take: 45_000,
  });
}

/** Admin: any status. */
export async function getProductById(id: string): Promise<ProductDetail | null> {
  if (!id) return null;
  return prisma.product.findUnique({ where: { id }, select: detailSelect });
}

// ── Writes ───────────────────────────────────────────────────────────────

export async function createProduct(input: CreateProductInput): Promise<ProductDetail> {
  const data = parseOrThrow(createProductSchema, input);

  try {
    return await prisma.$transaction(async (tx) => {
      let slug = data.slug ?? null;
      if (slug) {
        const taken = await tx.product.findUnique({ where: { slug }, select: { id: true } });
        if (taken) throw new ServiceError("CONFLICT", MSG.slugTaken);
      } else {
        slug = await ensureUniqueSlug(
          data.name,
          async (candidate) =>
            (await tx.product.findUnique({ where: { slug: candidate }, select: { id: true } })) !== null,
        );
      }

      const categoryIds = data.categoryIds ?? [];
      await assertCategoriesExist(tx, categoryIds);

      return tx.product.create({
        data: {
          name: data.name,
          slug,
          price: data.price ?? null,
          stockQuantity: data.stockQuantity ?? 0,
          description: descriptionData(data.description),
          status: data.status ?? PublicationStatus.DRAFT,
          categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
        },
        select: detailSelect,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError("CONFLICT", MSG.slugTaken);
    throw error;
  }
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<ProductDetail> {
  const data = parseOrThrow(updateProductSchema, input);

  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { id },
        select: { id: true, slug: true },
      });
      if (!existing) throw new ServiceError("NOT_FOUND", MSG.notFound);

      if (data.slug && data.slug !== existing.slug) {
        const taken = await tx.product.findUnique({
          where: { slug: data.slug },
          select: { id: true },
        });
        if (taken) throw new ServiceError("CONFLICT", MSG.slugTaken);
      }

      if (data.categoryIds !== undefined) {
        await replaceCategories(tx, id, data.categoryIds);
      }

      return tx.product.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.slug !== undefined && { slug: data.slug }),
          ...(data.price !== undefined && { price: data.price }),
          ...(data.stockQuantity !== undefined && { stockQuantity: data.stockQuantity }),
          ...(data.description !== undefined && { description: descriptionData(data.description) }),
          ...(data.status !== undefined && { status: data.status }),
        },
        select: detailSelect,
      });
    });
  } catch (error) {
    if (isUniqueViolation(error)) throw new ServiceError("CONFLICT", MSG.slugTaken);
    throw error;
  }
}

export async function archiveProduct(id: string): Promise<void> {
  const result = await prisma.product.updateMany({
    where: { id },
    data: { status: PublicationStatus.ARCHIVED },
  });
  if (result.count === 0) throw new ServiceError("NOT_FOUND", MSG.notFound);
}

/**
 * Permanently deletes a product. Refuses while any cart references it
 * (CartItem.productId is onDelete: Restrict) — archive the product instead.
 * Images/category links cascade. Storage objects are removed best-effort.
 */
export async function deleteProduct(id: string): Promise<void> {
  const keys = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id },
      select: {
        id: true,
        images: { select: { storageKey: true } },
        _count: { select: { cartItems: true } },
      },
    });
    if (!product) throw new ServiceError("NOT_FOUND", MSG.notFound);
    if (product._count.cartItems > 0) {
      throw new ServiceError(
        "CONFLICT",
        "این محصول در سبد خرید مشتریان وجود دارد و قابل حذف دائمی نیست. به‌جای حذف، آن را بایگانی کنید.",
      );
    }

    await tx.product.delete({ where: { id } });
    return product.images.map((i) => i.storageKey);
  });

  await bestEffortDeleteObjects(keys);
}

export async function setProductCategories(
  productId: string,
  categoryIds: string[],
): Promise<void> {
  const data = parseOrThrow(setCategoriesSchema, { productId, categoryIds });
  await prisma.$transaction(async (tx) => {
    const exists = await tx.product.findUnique({
      where: { id: data.productId },
      select: { id: true },
    });
    if (!exists) throw new ServiceError("NOT_FOUND", MSG.notFound);
    await replaceCategories(tx, data.productId, data.categoryIds);
  });
}

// ── Images ───────────────────────────────────────────────────────────────

/**
 * Registers an already-uploaded object (via presigned URL) as a product image.
 * The URL is derived server-side from the key; the object is verified in storage.
 */
export async function addProductImage(input: AddProductImageInput) {
  const data = parseOrThrow(addProductImageSchema, input);

  if (!isValidStorageKey(data.storageKey) || !data.storageKey.startsWith("product/")) {
    throw new ServiceError("VALIDATION", MSG.badImageKey);
  }
  if (!isS3Configured()) throw new ServiceError("UNAVAILABLE", MSG.storageUnavailable);

  let info: Awaited<ReturnType<typeof assertValidUploadedObject>>;
  let url: string;
  try {
    info = await assertValidUploadedObject(data.storageKey);
    url = buildPublicUrl(data.storageKey);
  } catch (error) {
    if (error instanceof StorageError) throw new ServiceError("VALIDATION", error.message);
    throw error;
  }

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({
      where: { id: data.productId },
      select: { id: true, _count: { select: { images: true } } },
    });
    if (!product) throw new ServiceError("NOT_FOUND", MSG.notFound);
    if (product._count.images >= MAX_PRODUCT_IMAGES) {
      throw new ServiceError("VALIDATION", MSG.tooManyImages);
    }

    const duplicate = await tx.productImage.findFirst({
      where: { productId: data.productId, storageKey: data.storageKey },
      select: { id: true },
    });
    if (duplicate) throw new ServiceError("CONFLICT", MSG.duplicateImage);

    const last = await tx.productImage.aggregate({
      where: { productId: data.productId },
      _max: { sortOrder: true },
    });

    await tx.mediaAsset.upsert({
      where: { storageKey: data.storageKey },
      create: {
        storageKey: data.storageKey,
        url,
        mimeType: info.contentType ?? "application/octet-stream",
        sizeBytes: info.size,
        purpose: "product",
        verifiedAt: new Date(),
      },
      update: { verifiedAt: new Date() },
    });

    return tx.productImage.create({
      data: {
        productId: data.productId,
        storageKey: data.storageKey,
        url,
        altText: data.altText ?? null,
        sortOrder: (last._max.sortOrder ?? -1) + 1,
        isPrimary: product._count.images === 0,
      },
      select: { id: true, url: true, storageKey: true, altText: true, sortOrder: true, isPrimary: true },
    });
  });
}

/** `orderedImageIds` must contain exactly the product's image ids. */
export async function reorderProductImages(
  productId: string,
  orderedImageIds: string[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const images = await tx.productImage.findMany({
      where: { productId },
      select: { id: true },
    });
    const existing = new Set(images.map((i) => i.id));
    if (
      new Set(orderedImageIds).size !== orderedImageIds.length ||
      existing.size !== orderedImageIds.length ||
      !orderedImageIds.every((imageId) => existing.has(imageId))
    ) {
      throw new ServiceError("VALIDATION", MSG.imageMismatch);
    }
    await Promise.all(
      orderedImageIds.map((imageId, index) =>
        tx.productImage.update({ where: { id: imageId }, data: { sortOrder: index } }),
      ),
    );
  });
}

export async function setPrimaryProductImage(
  productId: string,
  imageId: string,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const image = await tx.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true },
    });
    if (!image) throw new ServiceError("NOT_FOUND", MSG.imageNotFound);

    await tx.productImage.updateMany({
      where: { productId, isPrimary: true, NOT: { id: imageId } },
      data: { isPrimary: false },
    });
    await tx.productImage.update({ where: { id: imageId }, data: { isPrimary: true } });
  });
}

export async function removeProductImage(productId: string, imageId: string): Promise<void> {
  const storageKey = await prisma.$transaction(async (tx) => {
    const image = await tx.productImage.findFirst({
      where: { id: imageId, productId },
      select: { id: true, storageKey: true, isPrimary: true },
    });
    if (!image) throw new ServiceError("NOT_FOUND", MSG.imageNotFound);

    await tx.productImage.delete({ where: { id: image.id } });

    if (image.isPrimary) {
      const next = await tx.productImage.findFirst({
        where: { productId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });
      if (next) {
        await tx.productImage.update({ where: { id: next.id }, data: { isPrimary: true } });
      }
    }

    // Only delete the storage object when nothing else references it.
    const stillUsed = await tx.productImage.count({ where: { storageKey: image.storageKey } });
    return stillUsed === 0 ? image.storageKey : null;
  });

  if (storageKey) {
    await cleanupMedia(storageKey);
  }
}

async function cleanupMedia(storageKey: string): Promise<void> {
  await prisma.mediaAsset.deleteMany({ where: { storageKey } });
  await bestEffortDeleteObjects([storageKey]);
}

export async function updateProductImageAlt(
  productId: string,
  imageId: string,
  altText: string | null,
): Promise<void> {
  const result = await prisma.productImage.updateMany({
    where: { id: imageId, productId },
    data: { altText: altText && altText.trim() ? altText.trim().slice(0, 300) : null },
  });
  if (result.count === 0) throw new ServiceError("NOT_FOUND", MSG.imageNotFound);
}
