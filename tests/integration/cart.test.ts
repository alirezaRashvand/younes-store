import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { sha256 } from "@/lib/crypto";
import { ServiceError } from "@/lib/errors";
import { PublicationStatus, UserRole } from "@/generated/prisma/client";
import {
  MAX_QUANTITY_PER_ITEM,
  addItem,
  clearCart,
  findGuestCart,
  getCartView,
  getOrCreateGuestCart,
  getOrCreateUserCart,
  mergeGuestCartIntoUserCart,
  removeItem,
  updateQuantity,
} from "@/features/cart/service";
import { GUEST_CART_COOKIE_NAME, getGuestCartToken } from "@/features/cart/guest-cookie";
import { addToCartAction, removeCartItemAction, updateCartItemAction } from "@/features/cart/actions";
import { getCurrentCartItemCount } from "@/features/cart/summary";
import { getCurrentCartView } from "@/features/cart/current";
import { cookieJar } from "./helpers/cookie-jar";
import { makeProductRow, makeUser, rejection, signInAs, validGuestToken } from "./helpers/factories";

async function expectServiceError(promise: Promise<unknown>, code: ServiceError["code"] = "VALIDATION") {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ServiceError);
  expect((error as ServiceError).code).toBe(code);
  return error as ServiceError;
}

async function guestCart() {
  const token = validGuestToken();
  const cart = await getOrCreateGuestCart(token);
  return { token, cart };
}

describe("guest carts", () => {
  it("persists across lookups by token and never duplicates", async () => {
    const token = validGuestToken();
    const first = await getOrCreateGuestCart(token);
    const second = await getOrCreateGuestCart(token);
    expect(second.id).toBe(first.id);
    expect((await findGuestCart(token))?.id).toBe(first.id);
    expect(await prisma.cart.count()).toBe(1);
    expect(await findGuestCart(validGuestToken())).toBeNull();
  });

  it("stores only the sha256 hash of the token", async () => {
    const { token, cart } = await guestCart();
    const row = await prisma.cart.findUniqueOrThrow({ where: { id: cart.id } });
    expect(row.guestTokenHash).toBe(sha256(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.userId).toBeNull();
  });

  it("rejects implausible tokens (short / bad characters)", async () => {
    await expectServiceError(getOrCreateGuestCart("short"));
    await expectServiceError(getOrCreateGuestCart("!".repeat(40)));
    expect(await findGuestCart("short")).toBeNull();
    expect(await prisma.cart.count()).toBe(0);
  });

  it("concurrent creation for the same token yields a single cart", async () => {
    const token = validGuestToken();
    const [a, b, c] = await Promise.all([
      getOrCreateGuestCart(token),
      getOrCreateGuestCart(token),
      getOrCreateGuestCart(token),
    ]);
    expect(new Set([a.id, b.id, c.id]).size).toBe(1);
    expect(await prisma.cart.count()).toBe(1);
  });

  it("user carts are one-per-user", async () => {
    const user = await makeUser();
    const [a, b] = await Promise.all([getOrCreateUserCart(user.id), getOrCreateUserCart(user.id)]);
    expect(a.id).toBe(b.id);
    expect(await prisma.cart.count()).toBe(1);
  });
});

describe("addItem", () => {
  it("rejects products without a price", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ price: null });
    await expectServiceError(addItem(cart.id, product.id, 1));
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("rejects out-of-stock products", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 0 });
    await expectServiceError(addItem(cart.id, product.id, 1));
  });

  it("rejects DRAFT and ARCHIVED products", async () => {
    const { cart } = await guestCart();
    for (const status of [PublicationStatus.DRAFT, PublicationStatus.ARCHIVED]) {
      const product = await makeProductRow({ status });
      await expectServiceError(addItem(cart.id, product.id, 1));
    }
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("rejects unknown products and carts", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow();
    await expectServiceError(addItem(cart.id, "missing", 1), "NOT_FOUND");
    await expectServiceError(addItem("missing", product.id, 1), "NOT_FOUND");
  });

  it("rejects invalid quantities", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 500 });
    for (const qty of [0, -1, 1.5, MAX_QUANTITY_PER_ITEM + 1, Number.NaN]) {
      await expectServiceError(addItem(cart.id, product.id, qty));
    }
    expect(await prisma.cartItem.count()).toBe(0);
  });

  it("never lets the cart quantity exceed stock", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 3 });
    await expectServiceError(addItem(cart.id, product.id, 4));
    await addItem(cart.id, product.id, 3);
    await expectServiceError(addItem(cart.id, product.id, 1));
    const item = await prisma.cartItem.findFirstOrThrow();
    expect(item.quantity).toBe(3);
  });

  it("caps at the per-item maximum even when stock is larger", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 1000 });
    await addItem(cart.id, product.id, MAX_QUANTITY_PER_ITEM);
    await expectServiceError(addItem(cart.id, product.id, 1));
  });

  it("a duplicate add increments the single row", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 10 });
    await addItem(cart.id, product.id, 2);
    await addItem(cart.id, product.id, 3);
    const items = await prisma.cartItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(5);
  });

  it("concurrent adds of the same new product neither error out nor duplicate rows nor lose units", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 10 });
    const results = await Promise.allSettled([
      addItem(cart.id, product.id, 1),
      addItem(cart.id, product.id, 1),
      addItem(cart.id, product.id, 1),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    const items = await prisma.cartItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it("concurrent adds can never push the quantity above stock", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 2 });
    const results = await Promise.allSettled([
      addItem(cart.id, product.id, 1),
      addItem(cart.id, product.id, 1),
      addItem(cart.id, product.id, 1),
      addItem(cart.id, product.id, 1),
    ]);
    // Rejections must be clean validation errors, not raw database errors.
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(ServiceError);
    }
    const items = await prisma.cartItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(2);
  });
});

describe("updateQuantity / removeItem / clearCart", () => {
  it("sets an absolute quantity within stock, removes at <= 0", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 5 });
    await addItem(cart.id, product.id, 1);

    await updateQuantity(cart.id, product.id, 4);
    expect((await prisma.cartItem.findFirstOrThrow()).quantity).toBe(4);
    await expectServiceError(updateQuantity(cart.id, product.id, 6));
    await expectServiceError(updateQuantity(cart.id, product.id, 2.5));

    await updateQuantity(cart.id, product.id, 0);
    expect(await prisma.cartItem.count()).toBe(0);
    await expectServiceError(updateQuantity(cart.id, product.id, 2), "NOT_FOUND");
  });

  it("cannot raise the quantity of an item whose product got unpublished", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 5 });
    await addItem(cart.id, product.id, 1);
    await prisma.product.update({ where: { id: product.id }, data: { status: "ARCHIVED" } });
    await expectServiceError(updateQuantity(cart.id, product.id, 2));
  });

  it("removeItem and clearCart only affect the given cart", async () => {
    const a = await guestCart();
    const b = await guestCart();
    const product = await makeProductRow();
    await addItem(a.cart.id, product.id, 1);
    await addItem(b.cart.id, product.id, 1);

    await removeItem(a.cart.id, product.id);
    expect(await prisma.cartItem.count({ where: { cartId: a.cart.id } })).toBe(0);
    expect(await prisma.cartItem.count({ where: { cartId: b.cart.id } })).toBe(1);

    await clearCart(b.cart.id);
    expect(await prisma.cartItem.count()).toBe(0);
  });
});

describe("getCartView (server-side totals)", () => {
  it("uses the current DB price after a price change", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ price: BigInt(100_000), stockQuantity: 10 });
    await addItem(cart.id, product.id, 3);
    expect((await getCartView(cart.id)).total).toBe(BigInt(300_000));

    await prisma.product.update({ where: { id: product.id }, data: { price: BigInt(120_000) } });
    const view = await getCartView(cart.id);
    expect(view.total).toBe(BigInt(360_000));
    expect(view.items[0]).toMatchObject({ unitPrice: BigInt(120_000), lineTotal: BigInt(360_000), issue: null });
    expect(view.itemCount).toBe(3);
    expect(view.hasIssues).toBe(false);
  });

  it("excludes products that became unpriced, unpublished or out of stock, and flags them", async () => {
    const { cart } = await guestCart();
    const ok = await makeProductRow({ price: BigInt(10), stockQuantity: 10 });
    const noPrice = await makeProductRow({ price: BigInt(10), stockQuantity: 10 });
    const archived = await makeProductRow({ price: BigInt(10), stockQuantity: 10 });
    const soldOut = await makeProductRow({ price: BigInt(10), stockQuantity: 10 });
    for (const p of [ok, noPrice, archived, soldOut]) await addItem(cart.id, p.id, 2);

    await prisma.product.update({ where: { id: noPrice.id }, data: { price: null } });
    await prisma.product.update({ where: { id: archived.id }, data: { status: "ARCHIVED" } });
    await prisma.product.update({ where: { id: soldOut.id }, data: { stockQuantity: 0 } });

    const view = await getCartView(cart.id);
    expect(view.total).toBe(BigInt(20));
    expect(view.itemCount).toBe(2);
    expect(view.hasIssues).toBe(true);
    const issues = Object.fromEntries(view.items.map((i) => [i.productId, i.issue]));
    expect(issues).toEqual({
      [ok.id]: null,
      [noPrice.id]: "NO_PRICE",
      [archived.id]: "UNAVAILABLE",
      [soldOut.id]: "OUT_OF_STOCK",
    });
  });

  it("caps priced quantity by reduced stock", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ price: BigInt(1000), stockQuantity: 10 });
    await addItem(cart.id, product.id, 8);
    await prisma.product.update({ where: { id: product.id }, data: { stockQuantity: 3 } });
    const view = await getCartView(cart.id);
    expect(view.items[0]).toMatchObject({ quantity: 8, effectiveQuantity: 3, issue: "STOCK_REDUCED" });
    expect(view.total).toBe(BigInt(3000));
    expect(view.itemCount).toBe(3);
  });

  it("handles BigInt prices beyond 32 bits exactly", async () => {
    const { cart } = await guestCart();
    const product = await makeProductRow({ price: BigInt(9_000_000_000), stockQuantity: 5 });
    await addItem(cart.id, product.id, 5);
    expect((await getCartView(cart.id)).total).toBe(BigInt(45_000_000_000));
  });

  it("throws NOT_FOUND for an unknown cart", async () => {
    await expectServiceError(getCartView("missing"), "NOT_FOUND");
  });
});

describe("mergeGuestCartIntoUserCart", () => {
  it("sums quantities with the user's existing cart and caps at stock", async () => {
    const user = await makeUser();
    const userCart = await getOrCreateUserCart(user.id);
    const { token, cart } = await guestCart();

    const shared = await makeProductRow({ stockQuantity: 5 });
    const guestOnly = await makeProductRow({ stockQuantity: 10 });
    const userOnly = await makeProductRow({ stockQuantity: 10 });

    await addItem(userCart.id, shared.id, 3);
    await addItem(userCart.id, userOnly.id, 1);
    await addItem(cart.id, shared.id, 4); // 3 + 4 = 7 > stock 5 -> 5
    await addItem(cart.id, guestOnly.id, 2);

    const result = await mergeGuestCartIntoUserCart(token, user.id);
    expect(result).toEqual({ merged: 2, dropped: 0 });

    const items = await prisma.cartItem.findMany({ where: { cartId: userCart.id } });
    const byProduct = Object.fromEntries(items.map((i) => [i.productId, i.quantity]));
    expect(byProduct).toEqual({ [shared.id]: 5, [guestOnly.id]: 2, [userOnly.id]: 1 });
  });

  it("drops invalid products (draft, archived, unpriced, out of stock) and keeps valid ones", async () => {
    const user = await makeUser();
    const { token, cart } = await guestCart();
    const valid = await makeProductRow({ stockQuantity: 5 });
    const invalid = {
      noPrice: await makeProductRow({ price: null, stockQuantity: 5 }),
      draft: await makeProductRow({ status: "DRAFT", stockQuantity: 5 }),
      archived: await makeProductRow({ status: "ARCHIVED", stockQuantity: 5 }),
      soldOut: await makeProductRow({ stockQuantity: 5 }),
    };
    // Items are valid when added; the catalogue changes afterwards (as in real life).
    for (const p of [valid, ...Object.values(invalid)]) {
      await prisma.cartItem.create({ data: { cartId: cart.id, productId: p.id, quantity: 2 } });
    }
    await prisma.product.update({ where: { id: invalid.soldOut.id }, data: { stockQuantity: 0 } });

    const result = await mergeGuestCartIntoUserCart(token, user.id);
    expect(result).toEqual({ merged: 1, dropped: 4 });

    const userCart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id }, include: { items: true } });
    expect(userCart.items.map((i) => i.productId)).toEqual([valid.id]);
  });

  it("deletes the guest cart so the raw token no longer resolves to anything", async () => {
    const user = await makeUser();
    const { token, cart } = await guestCart();
    const product = await makeProductRow();
    await addItem(cart.id, product.id, 1);

    await mergeGuestCartIntoUserCart(token, user.id);

    expect(await findGuestCart(token)).toBeNull();
    expect(await prisma.cart.findUnique({ where: { id: cart.id } })).toBeNull();
    expect(await prisma.cart.count({ where: { guestTokenHash: { not: null } } })).toBe(0);
    // Merging again is a harmless no-op and must not double quantities.
    expect(await mergeGuestCartIntoUserCart(token, user.id)).toEqual({ merged: 0, dropped: 0 });
    expect((await prisma.cartItem.findFirstOrThrow()).quantity).toBe(1);
  });

  it("creates the user's cart when they have none", async () => {
    const user = await makeUser();
    const { token, cart } = await guestCart();
    const product = await makeProductRow();
    await addItem(cart.id, product.id, 2);
    expect(await prisma.cart.findUnique({ where: { userId: user.id } })).toBeNull();
    await mergeGuestCartIntoUserCart(token, user.id);
    const created = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id }, include: { items: true } });
    expect(created.items[0]).toMatchObject({ productId: product.id, quantity: 2 });
  });

  it("is a no-op for unknown or implausible tokens", async () => {
    const user = await makeUser();
    expect(await mergeGuestCartIntoUserCart(validGuestToken(), user.id)).toEqual({ merged: 0, dropped: 0 });
    expect(await mergeGuestCartIntoUserCart("short", user.id)).toEqual({ merged: 0, dropped: 0 });
    expect(await prisma.cart.count()).toBe(0);
  });

  it("is transactional: a failure at the end rolls back every merged item", async () => {
    const user = await makeUser();
    const userCart = await getOrCreateUserCart(user.id);
    const { token, cart } = await guestCart();
    const p1 = await makeProductRow({ stockQuantity: 10 });
    const p2 = await makeProductRow({ stockQuantity: 10 });
    await addItem(userCart.id, p1.id, 1);
    await addItem(cart.id, p1.id, 2);
    await addItem(cart.id, p2.id, 2);

    // Make the final `DELETE FROM carts` of the merge fail inside the transaction.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_block_cart_delete() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'blocked for test'; END; $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(
      `CREATE TRIGGER test_block_cart_delete BEFORE DELETE ON carts FOR EACH ROW EXECUTE FUNCTION test_block_cart_delete()`,
    );
    try {
      await expect(mergeGuestCartIntoUserCart(token, user.id)).rejects.toThrow();
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_block_cart_delete ON carts`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS test_block_cart_delete()`);
    }

    // Nothing from the failed merge is visible, and the guest cart is intact.
    const userItems = await prisma.cartItem.findMany({ where: { cartId: userCart.id } });
    expect(userItems.map((i) => [i.productId, i.quantity])).toEqual([[p1.id, 1]]);
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(2);
    expect((await findGuestCart(token))?.id).toBe(cart.id);

    // And a retry afterwards succeeds.
    expect(await mergeGuestCartIntoUserCart(token, user.id)).toEqual({ merged: 2, dropped: 0 });
  });

  it("concurrent merges of the same guest token apply it at most once", async () => {
    const user = await makeUser();
    const { token, cart } = await guestCart();
    const product = await makeProductRow({ stockQuantity: 20 });
    await addItem(cart.id, product.id, 4);

    await Promise.allSettled([
      mergeGuestCartIntoUserCart(token, user.id),
      mergeGuestCartIntoUserCart(token, user.id),
    ]);

    const items = await prisma.cartItem.findMany();
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(4);
    expect(await prisma.cart.count({ where: { guestTokenHash: { not: null } } })).toBe(0);
  });
});

describe("cart server actions (cookies)", () => {
  it("addToCartAction creates a guest cart bound to an httpOnly cookie holding the raw token", async () => {
    const product = await makeProductRow({ stockQuantity: 5 });
    expect((await addToCartAction(product.id, 2)).ok).toBe(true);

    const token = await getGuestCartToken();
    expect(token).not.toBeNull();
    expect(cookieJar.options(GUEST_CART_COOKIE_NAME)).toMatchObject({ httpOnly: true, sameSite: "lax" });

    const cart = await prisma.cart.findFirstOrThrow({ include: { items: true } });
    expect(cart.guestTokenHash).toBe(sha256(token!));
    expect(cart.guestTokenHash).not.toBe(token);
    expect(cart.items[0]).toMatchObject({ productId: product.id, quantity: 2 });

    // Same cookie → same cart; counts and views are read-only lookups.
    await addToCartAction(product.id, 1);
    expect(await prisma.cart.count()).toBe(1);
    expect(await getCurrentCartItemCount()).toBe(3);
    expect((await getCurrentCartView())?.total).toBe(BigInt(300_000));
  });

  it("signed-in users get a user cart and no guest cookie", async () => {
    const user = await makeUser(UserRole.CUSTOMER);
    await signInAs(user.id);
    const product = await makeProductRow();
    expect((await addToCartAction(product.id, 1)).ok).toBe(true);
    expect(cookieJar.has(GUEST_CART_COOKIE_NAME)).toBe(false);
    const cart = await prisma.cart.findUniqueOrThrow({ where: { userId: user.id }, include: { items: true } });
    expect(cart.items).toHaveLength(1);
  });

  it("returns failures (not exceptions) for invalid products and inputs", async () => {
    const unpriced = await makeProductRow({ price: null });
    expect((await addToCartAction(unpriced.id, 1)).ok).toBe(false);
    expect((await addToCartAction("", 1)).ok).toBe(false);
    expect((await addToCartAction(unpriced.id, "1" as unknown as number)).ok).toBe(false);
    expect((await addToCartAction("missing", 1)).ok).toBe(false);
  });

  it("update and remove actions work on the visitor's own cart only", async () => {
    const product = await makeProductRow({ stockQuantity: 5 });
    await addToCartAction(product.id, 1);
    expect((await updateCartItemAction(product.id, 3)).ok).toBe(true);
    expect((await prisma.cartItem.findFirstOrThrow()).quantity).toBe(3);

    // A different visitor (no cookie) can't touch that cart's items.
    cookieJar.clear();
    expect((await removeCartItemAction(product.id)).ok).toBe(true); // creates their own empty cart
    expect((await prisma.cartItem.findFirstOrThrow()).quantity).toBe(3);
  });

  it("a signed-in user's view ignores any guest cookie", async () => {
    const user = await makeUser();
    await signInAs(user.id);
    expect(await getCurrentCartView()).toBeNull();
    expect(await getCurrentCartItemCount()).toBe(0);
  });
});
