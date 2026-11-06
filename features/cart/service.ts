import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { PublicationStatus, type Prisma } from "@/generated/prisma/client";
import { isUniqueViolation, ServiceError } from "@/lib/errors";
import { isPlausibleGuestToken } from "@/features/cart/guest-cookie";

export const MAX_QUANTITY_PER_ITEM = 99;

const idSchema = z.string().min(1).max(64);
const quantitySchema = z
  .number({ error: "تعداد نامعتبر است." })
  .int("تعداد باید عدد صحیح باشد.")
  .min(1, "تعداد باید حداقل ۱ باشد.")
  .max(MAX_QUANTITY_PER_ITEM, `حداکثر تعداد مجاز ${MAX_QUANTITY_PER_ITEM} عدد است.`);

const MSG = {
  invalidToken: "نشست سبد خرید نامعتبر است.",
  notFound: "محصول مورد نظر یافت نشد.",
  notPurchasable: "این محصول در حال حاضر قابل خرید نیست.",
  noPrice: "قیمت این محصول مشخص نیست؛ لطفاً با فروشگاه تماس بگیرید.",
  outOfStock: "این محصول موجود نیست.",
  insufficientStock: "موجودی محصول کافی نیست.",
  cartNotFound: "سبد خرید یافت نشد.",
  itemNotFound: "این محصول در سبد خرید شما نیست.",
} as const;

type Tx = Prisma.TransactionClient;

export function hashGuestToken(guestToken: string): string {
  return sha256(guestToken);
}

export interface CartRef {
  id: string;
}

// ── Cart lookup / creation ───────────────────────────────────────────────

export async function getOrCreateGuestCart(guestToken: string): Promise<CartRef> {
  if (!isPlausibleGuestToken(guestToken)) {
    throw new ServiceError("VALIDATION", MSG.invalidToken);
  }
  const guestTokenHash = hashGuestToken(guestToken);
  const existing = await prisma.cart.findUnique({
    where: { guestTokenHash },
    select: { id: true, userId: true },
  });
  if (existing) return { id: existing.id };

  try {
    const created = await prisma.cart.create({
      data: { guestTokenHash },
      select: { id: true },
    });
    return created;
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await prisma.cart.findUnique({
        where: { guestTokenHash },
        select: { id: true },
      });
      if (raced) return raced;
    }
    throw error;
  }
}

export async function getOrCreateUserCart(userId: string): Promise<CartRef> {
  return prisma.$transaction((tx) => getOrCreateUserCartTx(tx, userId));
}

/**
 * Prisma's upsert is not atomic (select, then insert), so two concurrent first
 * requests for the same user would hit carts_user_id_key. A transaction-scoped
 * advisory lock per user serializes them; the loser then finds the winner's row.
 */
async function getOrCreateUserCartTx(
  db: Pick<Tx, "cart" | "$executeRaw">,
  userId: string,
): Promise<CartRef> {
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`cart:${userId}`}))`;
  return db.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
    select: { id: true },
  });
}

/** Find an existing guest cart without creating one (for read-only views). */
export async function findGuestCart(guestToken: string): Promise<CartRef | null> {
  if (!isPlausibleGuestToken(guestToken)) return null;
  return prisma.cart.findUnique({
    where: { guestTokenHash: hashGuestToken(guestToken) },
    select: { id: true },
  });
}

// ── Item operations ──────────────────────────────────────────────────────

interface PurchasableCheck {
  status: PublicationStatus;
  price: bigint | null;
  stockQuantity: number;
}

function assertPurchasable(product: PurchasableCheck): void {
  if (product.status !== PublicationStatus.PUBLISHED) {
    throw new ServiceError("VALIDATION", MSG.notPurchasable);
  }
  if (product.price === null) {
    throw new ServiceError("VALIDATION", MSG.noPrice);
  }
  if (product.stockQuantity <= 0) {
    throw new ServiceError("VALIDATION", MSG.outOfStock);
  }
}

export async function addItem(
  cartId: string,
  productId: string,
  quantity = 1,
): Promise<void> {
  const cartIdParsed = idSchema.parse(cartId);
  const productIdParsed = idSchema.parse(productId);
  const qtyResult = quantitySchema.safeParse(quantity);
  if (!qtyResult.success) {
    throw new ServiceError("VALIDATION", qtyResult.error.issues[0]?.message ?? MSG.insufficientStock);
  }
  const qty = qtyResult.data;

  await prisma.$transaction(async (tx) => {
    // Lock the cart row so concurrent adds to the same cart (e.g. a double click)
    // run one after another: no duplicate-row unique violations, no lost increments,
    // and the stock check always sees the previous add's quantity.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM carts WHERE id = ${cartIdParsed} FOR UPDATE
    `;
    if (locked.length === 0) throw new ServiceError("NOT_FOUND", MSG.cartNotFound);

    const product = await tx.product.findUnique({
      where: { id: productIdParsed },
      select: { status: true, price: true, stockQuantity: true },
    });
    if (!product) throw new ServiceError("NOT_FOUND", MSG.notFound);
    assertPurchasable(product);

    const existing = await tx.cartItem.findUnique({
      where: { cartId_productId: { cartId: cartIdParsed, productId: productIdParsed } },
      select: { id: true, quantity: true },
    });

    const nextQuantity = (existing?.quantity ?? 0) + qty;
    if (nextQuantity > product.stockQuantity) {
      throw new ServiceError(
        "VALIDATION",
        `${MSG.insufficientStock} (حداکثر ${product.stockQuantity} عدد)`,
      );
    }
    if (nextQuantity > MAX_QUANTITY_PER_ITEM) {
      throw new ServiceError(
        "VALIDATION",
        `حداکثر تعداد مجاز ${MAX_QUANTITY_PER_ITEM} عدد است.`,
      );
    }

    if (existing) {
      await tx.cartItem.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await tx.cartItem.create({
        data: { cartId: cartIdParsed, productId: productIdParsed, quantity: nextQuantity },
      });
    }
    await tx.cart.update({ where: { id: cartIdParsed }, data: { updatedAt: new Date() } });
  });
}

/** Sets an absolute quantity. quantity <= 0 removes the item. */
export async function updateQuantity(
  cartId: string,
  productId: string,
  quantity: number,
): Promise<void> {
  const cartIdParsed = idSchema.parse(cartId);
  const productIdParsed = idSchema.parse(productId);
  if (!Number.isInteger(quantity)) {
    throw new ServiceError("VALIDATION", "تعداد باید عدد صحیح باشد.");
  }
  if (quantity <= 0) {
    await removeItem(cartIdParsed, productIdParsed);
    return;
  }
  const qtyResult = quantitySchema.safeParse(quantity);
  if (!qtyResult.success) {
    throw new ServiceError("VALIDATION", qtyResult.error.issues[0]?.message ?? MSG.insufficientStock);
  }

  await prisma.$transaction(async (tx) => {
    const item = await tx.cartItem.findUnique({
      where: { cartId_productId: { cartId: cartIdParsed, productId: productIdParsed } },
      select: { id: true, product: { select: { status: true, price: true, stockQuantity: true } } },
    });
    if (!item) throw new ServiceError("NOT_FOUND", MSG.itemNotFound);

    assertPurchasable(item.product);
    if (qtyResult.data > item.product.stockQuantity) {
      throw new ServiceError(
        "VALIDATION",
        `${MSG.insufficientStock} (حداکثر ${item.product.stockQuantity} عدد)`,
      );
    }
    await tx.cartItem.update({
      where: { id: item.id },
      data: { quantity: qtyResult.data },
    });
  });
}

export async function removeItem(cartId: string, productId: string): Promise<void> {
  await prisma.cartItem.deleteMany({
    where: { cartId: idSchema.parse(cartId), productId: idSchema.parse(productId) },
  });
}

export async function clearCart(cartId: string): Promise<void> {
  await prisma.cartItem.deleteMany({ where: { cartId: idSchema.parse(cartId) } });
}

// ── View ─────────────────────────────────────────────────────────────────

export type CartItemIssue = "UNAVAILABLE" | "NO_PRICE" | "OUT_OF_STOCK" | "STOCK_REDUCED";

export interface CartItemView {
  productId: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  unitPrice: bigint | null;
  /** Quantity stored in the cart. */
  quantity: number;
  /** Quantity used for pricing (capped by current stock; 0 when not purchasable). */
  effectiveQuantity: number;
  stockQuantity: number;
  lineTotal: bigint | null;
  isPurchasable: boolean;
  issue: CartItemIssue | null;
}

export interface CartView {
  cartId: string;
  items: CartItemView[];
  /** Total number of purchasable units. */
  itemCount: number;
  /** Server-calculated total in Toman (only purchasable items). */
  total: bigint;
  hasIssues: boolean;
}

export async function getCartView(cartId: string): Promise<CartView> {
  const cart = await prisma.cart.findUnique({
    where: { id: idSchema.parse(cartId) },
    select: {
      id: true,
      items: {
        orderBy: { createdAt: "asc" },
        select: {
          quantity: true,
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              stockQuantity: true,
              status: true,
              images: {
                orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }],
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      },
    },
  });
  if (!cart) throw new ServiceError("NOT_FOUND", MSG.cartNotFound);

  let total = BigInt(0);
  let itemCount = 0;
  let hasIssues = false;

  const items = cart.items.map((item): CartItemView => {
    const { product } = item;
    let issue: CartItemIssue | null = null;
    if (product.status !== PublicationStatus.PUBLISHED) issue = "UNAVAILABLE";
    else if (product.price === null) issue = "NO_PRICE";
    else if (product.stockQuantity <= 0) issue = "OUT_OF_STOCK";

    const isPurchasable = issue === null;
    const effectiveQuantity = isPurchasable
      ? Math.min(item.quantity, product.stockQuantity)
      : 0;
    if (isPurchasable && effectiveQuantity < item.quantity) issue = "STOCK_REDUCED";

    const lineTotal =
      isPurchasable && product.price !== null
        ? product.price * BigInt(effectiveQuantity)
        : null;
    if (lineTotal !== null) {
      total += lineTotal;
      itemCount += effectiveQuantity;
    }
    if (issue !== null) hasIssues = true;

    return {
      productId: product.id,
      name: product.name,
      slug: product.slug,
      imageUrl: product.images[0]?.url ?? null,
      unitPrice: product.price,
      quantity: item.quantity,
      effectiveQuantity,
      stockQuantity: product.stockQuantity,
      lineTotal,
      isPurchasable,
      issue,
    };
  });

  return { cartId: cart.id, items, itemCount, total, hasIssues };
}

// ── Merge ────────────────────────────────────────────────────────────────

export interface MergeResult {
  merged: number;
  dropped: number;
}

/**
 * Merges the guest cart into the user's cart in one transaction:
 * quantities are summed and capped by stock; unpublished / priceless /
 * out-of-stock products are dropped. The guest cart (and with it the guest
 * token hash) is deleted so the raw token can no longer be used.
 */
export async function mergeGuestCartIntoUserCart(
  guestToken: string,
  userId: string,
): Promise<MergeResult> {
  if (!isPlausibleGuestToken(guestToken)) return { merged: 0, dropped: 0 };
  const guestTokenHash = hashGuestToken(guestToken);

  return prisma.$transaction(async (tx) => {
    const guestCart = await tx.cart.findUnique({
      where: { guestTokenHash },
      select: {
        id: true,
        userId: true,
        items: {
          select: {
            productId: true,
            quantity: true,
            product: { select: { status: true, price: true, stockQuantity: true } },
          },
        },
      },
    });
    if (!guestCart) return { merged: 0, dropped: 0 };

    const userCart = await getOrCreateUserCartTx(tx, userId);
    if (userCart.id === guestCart.id) return { merged: 0, dropped: 0 };

    const existingItems = await tx.cartItem.findMany({
      where: { cartId: userCart.id },
      select: { productId: true, quantity: true },
    });
    const existingByProduct = new Map(
      existingItems.map((i) => [i.productId, i.quantity] as const),
    );

    let merged = 0;
    let dropped = 0;

    for (const item of guestCart.items) {
      const { product } = item;
      const valid =
        product.status === PublicationStatus.PUBLISHED &&
        product.price !== null &&
        product.stockQuantity > 0;
      if (!valid) {
        dropped++;
        continue;
      }

      const existingQty = existingByProduct.get(item.productId) ?? 0;
      const nextQty = Math.min(
        existingQty + item.quantity,
        product.stockQuantity,
        MAX_QUANTITY_PER_ITEM,
      );

      await tx.cartItem.upsert({
        where: { cartId_productId: { cartId: userCart.id, productId: item.productId } },
        create: { cartId: userCart.id, productId: item.productId, quantity: nextQty },
        update: { quantity: nextQty },
      });
      merged++;
    }

    // Deleting the guest cart cascades its items and invalidates the token hash.
    await tx.cart.delete({ where: { id: guestCart.id } });

    return { merged, dropped };
  });
}
