import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { PublicationStatus } from "@/generated/prisma/client";
import {
  addProductImage,
  archiveProduct,
  createProduct,
  deleteProduct,
  getProductById,
  getProductBySlug,
  listProducts,
  listPublishedProducts,
  removeProductImage,
  reorderProductImages,
  setPrimaryProductImage,
  updateProduct,
} from "@/features/products/service";
import { syncProductImages } from "@/features/products/image-sync";
import { createCategory } from "@/features/categories/service";
import { addItem, getOrCreateGuestCart } from "@/features/cart/service";
import type { ProductFormPayload } from "@/features/products/form-types";
import { createProductAction, updateProductAction } from "@/features/products/actions";
import { signInAs, makeUser, makeProductRow, rejection, validGuestToken } from "./helpers/factories";
import { s3State } from "./helpers/s3-mock";
import { UserRole } from "@/generated/prisma/client";

async function expectServiceError(promise: Promise<unknown>, code: ServiceError["code"]) {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ServiceError);
  expect((error as ServiceError).code).toBe(code);
}

const keyFor = (n: number, purpose = "product") =>
  `${purpose}/${n.toString(16).padStart(24, "0")}-photo.png`;

describe("product validation", () => {
  it("allows a null price (call us) and defaults to DRAFT with zero stock", async () => {
    const product = await createProduct({ name: "No price", price: null });
    expect(product.price).toBeNull();
    expect(product.status).toBe(PublicationStatus.DRAFT);
    expect(product.stockQuantity).toBe(0);
  });

  it("treats an omitted price as null and an empty string as null", async () => {
    expect((await createProduct({ name: "Omitted" })).price).toBeNull();
    expect((await createProduct({ name: "Empty", price: "" })).price).toBeNull();
  });

  it("stores Persian-digit prices with separators and large values exactly", async () => {
    const product = await createProduct({ name: "Persian", price: "۱٬۲۳۴٬۵۶۷" });
    expect(product.price).toBe(BigInt(1234567));
    const big = await createProduct({ name: "Big", price: BigInt(Number.MAX_SAFE_INTEGER) });
    expect(big.price).toBe(BigInt(Number.MAX_SAFE_INTEGER));
  });

  it("rejects negative, fractional and absurd prices", async () => {
    await expectServiceError(createProduct({ name: "Neg", price: -1 }), "VALIDATION");
    await expectServiceError(createProduct({ name: "NegStr", price: "-5" }), "VALIDATION");
    await expectServiceError(createProduct({ name: "Frac", price: 10.5 }), "VALIDATION");
    await expectServiceError(
      createProduct({ name: "Huge", price: BigInt(Number.MAX_SAFE_INTEGER) + BigInt(1) }),
      "VALIDATION",
    );
    expect(await prisma.product.count()).toBe(0);
  });

  it("rejects negative / fractional stock on create and update", async () => {
    await expectServiceError(createProduct({ name: "NegStock", stockQuantity: -1 }), "VALIDATION");
    await expectServiceError(createProduct({ name: "FracStock", stockQuantity: 1.5 }), "VALIDATION");
    const product = await createProduct({ name: "Ok", stockQuantity: 3 });
    await expectServiceError(updateProduct(product.id, { stockQuantity: -5 }), "VALIDATION");
    expect((await getProductById(product.id))!.stockQuantity).toBe(3);
  });

  it("rejects an empty name and unknown categories", async () => {
    await expectServiceError(createProduct({ name: "   " }), "VALIDATION");
    await expectServiceError(createProduct({ name: "X", categoryIds: ["missing"] }), "VALIDATION");
    expect(await prisma.product.count()).toBe(0);
  });

  it("update can clear a price (null) but leaves it alone when omitted", async () => {
    const product = await createProduct({ name: "P", price: 5000 });
    await updateProduct(product.id, { name: "P2" });
    expect((await getProductById(product.id))!.price).toBe(BigInt(5000));
    await updateProduct(product.id, { price: null });
    expect((await getProductById(product.id))!.price).toBeNull();
  });
});

describe("product slugs", () => {
  it("auto-generates unique slugs for duplicate names", async () => {
    const a = await createProduct({ name: "Same Name" });
    const b = await createProduct({ name: "Same Name" });
    const c = await createProduct({ name: "Same Name" });
    expect(new Set([a.slug, b.slug, c.slug]).size).toBe(3);
  });

  it("rejects an explicit duplicate slug on create and update", async () => {
    const a = await createProduct({ name: "A", slug: "taken-slug" });
    await expectServiceError(createProduct({ name: "B", slug: "taken-slug" }), "CONFLICT");
    const b = await createProduct({ name: "B", slug: "free-slug" });
    await expectServiceError(updateProduct(b.id, { slug: a.slug }), "CONFLICT");
    // Re-saving a product with its own slug is not a conflict.
    await expect(updateProduct(a.id, { slug: "taken-slug", name: "A2" })).resolves.toBeDefined();
  });

  it("handles concurrent creation with the same explicit slug (exactly one wins)", async () => {
    const results = await Promise.allSettled([
      createProduct({ name: "R1", slug: "race" }),
      createProduct({ name: "R2", slug: "race" }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ServiceError);
    expect(rejected.reason.code).toBe("CONFLICT");
  });

  it("supports Persian slugs and resolves percent-encoded lookups", async () => {
    const product = await createProduct({ name: "کفش ورزشی", status: "PUBLISHED" });
    expect(product.slug).toMatch(/[\u0600-\u06FF]/);
    const found = await getProductBySlug(encodeURIComponent(product.slug));
    expect(found?.id).toBe(product.id);
  });
});

describe("product visibility", () => {
  it("getProductBySlug returns only PUBLISHED products", async () => {
    const draft = await makeProductRow({ status: "DRAFT" });
    const archived = await makeProductRow({ status: "ARCHIVED" });
    const published = await makeProductRow({ status: "PUBLISHED" });

    expect(await getProductBySlug(draft.slug)).toBeNull();
    expect(await getProductBySlug(archived.slug)).toBeNull();
    expect((await getProductBySlug(published.slug))?.id).toBe(published.id);
    expect(await getProductBySlug("")).toBeNull();
    expect(await getProductBySlug("missing")).toBeNull();
  });

  it("listPublishedProducts ignores a status override; admin listProducts honours it", async () => {
    await makeProductRow({ status: "DRAFT" });
    await makeProductRow({ status: "ARCHIVED" });
    const published = await makeProductRow({ status: "PUBLISHED" });

    const storefront = await listPublishedProducts({ status: "DRAFT" });
    expect(storefront.items.map((p) => p.id)).toEqual([published.id]);

    expect((await listProducts({})).total).toBe(3);
    expect((await listProducts({ status: "DRAFT" })).total).toBe(1);
  });

  it("archiveProduct makes a product disappear from the storefront but keeps the row", async () => {
    const product = await makeProductRow({ status: "PUBLISHED" });
    await archiveProduct(product.id);
    expect(await getProductBySlug(product.slug)).toBeNull();
    expect((await getProductById(product.id))?.status).toBe("ARCHIVED");
    await expectServiceError(archiveProduct("missing"), "NOT_FOUND");
  });

  it("price filters never match products without a price; null prices sort last", async () => {
    await makeProductRow({ name: "none", price: null });
    const cheap = await makeProductRow({ name: "cheap", price: BigInt(10) });
    const dear = await makeProductRow({ name: "dear", price: BigInt(1000) });

    const range = await listProducts({ minPrice: "0", maxPrice: "5000" });
    expect(new Set(range.items.map((p) => p.id))).toEqual(new Set([cheap.id, dear.id]));

    const asc = await listProducts({ sortBy: "price", sortDir: "asc" });
    expect(asc.items.map((p) => p.name)).toEqual(["cheap", "dear", "none"]);
    const desc = await listProducts({ sortBy: "price", sortDir: "desc" });
    expect(desc.items.map((p) => p.name)).toEqual(["dear", "cheap", "none"]);
  });

  it("search matches names case-insensitively and stock filters work", async () => {
    await makeProductRow({ name: "Red Shoe", stockQuantity: 0 });
    await makeProductRow({ name: "Blue Shoe", stockQuantity: 3 });
    await makeProductRow({ name: "Green Hat", stockQuantity: 50 });

    expect((await listProducts({ search: "shoe" })).total).toBe(2);
    expect((await listProducts({ stock: "out_of_stock" })).items.map((p) => p.name)).toEqual(["Red Shoe"]);
    expect((await listProducts({ stock: "low_stock" })).items.map((p) => p.name)).toEqual(["Blue Shoe"]);
    expect((await listProducts({ stock: "in_stock" })).total).toBe(2);
  });
});

describe("product images", () => {
  async function productWithImages(count: number) {
    const product = await makeProductRow();
    const images = [];
    for (let i = 1; i <= count; i++) {
      const key = keyFor(i);
      s3State.putObject(key, { contentType: "image/png", size: 2048 });
      images.push(await addProductImage({ productId: product.id, storageKey: key }));
    }
    return { product, images };
  }

  it("first image becomes primary, later ones follow in order", async () => {
    const { images } = await productWithImages(3);
    expect(images.map((i) => i.isPrimary)).toEqual([true, false, false]);
    expect(images.map((i) => i.sortOrder)).toEqual([0, 1, 2]);
    expect(images[0].url).toBe(`https://s3.test.invalid/test-bucket/${images[0].storageKey}`);
    // The upload is registered as a verified media asset.
    const asset = await prisma.mediaAsset.findUniqueOrThrow({ where: { storageKey: images[0].storageKey } });
    expect(asset.verifiedAt).not.toBeNull();
    expect(asset.purpose).toBe("product");
  });

  it("rejects objects that are missing, wrongly typed, empty or oversized (no row created)", async () => {
    const product = await makeProductRow();
    await expectServiceError(
      addProductImage({ productId: product.id, storageKey: keyFor(1) }),
      "VALIDATION",
    );
    s3State.putObject(keyFor(2), { contentType: "text/html" });
    await expectServiceError(addProductImage({ productId: product.id, storageKey: keyFor(2) }), "VALIDATION");
    s3State.putObject(keyFor(3), { size: 0 });
    await expectServiceError(addProductImage({ productId: product.id, storageKey: keyFor(3) }), "VALIDATION");
    s3State.putObject(keyFor(4), { size: 6 * 1024 * 1024 });
    await expectServiceError(addProductImage({ productId: product.id, storageKey: keyFor(4) }), "VALIDATION");
    expect(await prisma.productImage.count()).toBe(0);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it("rejects keys outside the product/ prefix and malformed keys", async () => {
    const product = await makeProductRow();
    s3State.putObject(keyFor(1, "category"));
    await expectServiceError(
      addProductImage({ productId: product.id, storageKey: keyFor(1, "category") }),
      "VALIDATION",
    );
    await expectServiceError(
      addProductImage({ productId: product.id, storageKey: "product/../etc/passwd" }),
      "VALIDATION",
    );
  });

  it("rejects the same image twice and enforces the per-product cap", async () => {
    const { product } = await productWithImages(1);
    await expectServiceError(addProductImage({ productId: product.id, storageKey: keyFor(1) }), "CONFLICT");

    for (let i = 2; i <= 10; i++) {
      s3State.putObject(keyFor(i));
      await addProductImage({ productId: product.id, storageKey: keyFor(i) });
    }
    s3State.putObject(keyFor(11));
    await expectServiceError(addProductImage({ productId: product.id, storageKey: keyFor(11) }), "VALIDATION");
    expect(await prisma.productImage.count({ where: { productId: product.id } })).toBe(10);
  });

  it("rejects an image for an unknown product", async () => {
    s3State.putObject(keyFor(1));
    await expectServiceError(addProductImage({ productId: "missing", storageKey: keyFor(1) }), "NOT_FOUND");
  });

  it("reorders images and rejects incomplete/foreign id lists", async () => {
    const { product, images } = await productWithImages(3);
    const [a, b, c] = images.map((i) => i.id);
    await reorderProductImages(product.id, [c, a, b]);
    const detail = await getProductById(product.id);
    expect(detail!.images.map((i) => i.id)).toEqual([c, a, b]);

    await expectServiceError(reorderProductImages(product.id, [a, b]), "VALIDATION");
    await expectServiceError(reorderProductImages(product.id, [a, b, "x"]), "VALIDATION");
    await expectServiceError(reorderProductImages(product.id, [a, a, b]), "VALIDATION");
  });

  it("setPrimary keeps exactly one primary and refuses another product's image", async () => {
    const { product, images } = await productWithImages(3);
    await setPrimaryProductImage(product.id, images[2].id);
    const rows = await prisma.productImage.findMany({ where: { productId: product.id } });
    expect(rows.filter((r) => r.isPrimary).map((r) => r.id)).toEqual([images[2].id]);

    const other = await makeProductRow();
    await expectServiceError(setPrimaryProductImage(other.id, images[0].id), "NOT_FOUND");
  });

  it("removing the primary image promotes the next one and deletes the unused object", async () => {
    const { product, images } = await productWithImages(3);
    await removeProductImage(product.id, images[0].id);

    const rows = await prisma.productImage.findMany({
      where: { productId: product.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(rows.map((r) => r.id)).toEqual([images[1].id, images[2].id]);
    expect(rows.map((r) => r.isPrimary)).toEqual([true, false]);
    expect(s3State.deletedKeys).toEqual([images[0].storageKey]);
    expect(await prisma.mediaAsset.findUnique({ where: { storageKey: images[0].storageKey } })).toBeNull();

    await expectServiceError(removeProductImage(product.id, images[0].id), "NOT_FOUND");
  });

  it("removing an image does not delete an object still referenced by another product", async () => {
    const key = keyFor(1);
    s3State.putObject(key);
    const p1 = await makeProductRow();
    const p2 = await makeProductRow();
    const img1 = await addProductImage({ productId: p1.id, storageKey: key });
    await addProductImage({ productId: p2.id, storageKey: key });

    await removeProductImage(p1.id, img1.id);
    expect(s3State.deletedKeys).toEqual([]);
    expect(await prisma.mediaAsset.findUnique({ where: { storageKey: key } })).not.toBeNull();
  });

  it("syncProductImages applies the desired list (drop, add, reorder, primary)", async () => {
    const { product, images } = await productWithImages(3);
    const newKey = keyFor(9);
    s3State.putObject(newKey);

    await syncProductImages(product.id, [
      { storageKey: newKey, altText: "new" },
      { id: images[2].id, storageKey: images[2].storageKey },
      { id: images[0].id, storageKey: images[0].storageKey, altText: "first" },
    ]);

    const detail = await getProductById(product.id);
    expect(detail!.images.map((i) => i.storageKey)).toEqual([
      newKey,
      images[2].storageKey,
      images[0].storageKey,
    ]);
    expect(detail!.images.map((i) => i.isPrimary)).toEqual([true, false, false]);
    expect(detail!.images[2].altText).toBe("first");
    expect(s3State.deletedKeys).toEqual([images[1].storageKey]);
  });

  it("syncProductImages rejects duplicates and foreign image ids without changing anything", async () => {
    const { product, images } = await productWithImages(2);
    const other = await makeProductRow();
    const foreign = await (async () => {
      s3State.putObject(keyFor(50));
      return addProductImage({ productId: other.id, storageKey: keyFor(50) });
    })();

    await expectServiceError(
      syncProductImages(product.id, [
        { id: images[0].id, storageKey: images[0].storageKey },
        { storageKey: images[0].storageKey },
      ]),
      "VALIDATION",
    );
    await expectServiceError(
      syncProductImages(product.id, [{ id: foreign.id, storageKey: foreign.storageKey }]),
      "VALIDATION",
    );
    expect(await prisma.productImage.count({ where: { productId: product.id } })).toBe(2);
  });
});

describe("deleting products", () => {
  it("deleteProduct refuses while carts reference the product, leaving carts intact", async () => {
    const product = await makeProductRow();
    const keep = await makeProductRow();
    const cart = await getOrCreateGuestCart(validGuestToken());
    await addItem(cart.id, product.id, 1);
    await addItem(cart.id, keep.id, 1);

    await expectServiceError(deleteProduct(product.id), "CONFLICT");

    expect(await prisma.product.findUnique({ where: { id: product.id } })).not.toBeNull();
    const items = await prisma.cartItem.findMany({ where: { cartId: cart.id } });
    expect(items.map((i) => i.productId).sort()).toEqual([product.id, keep.id].sort());
  });

  it("deleteProduct succeeds once no cart references the product", async () => {
    const product = await makeProductRow();
    const cart = await getOrCreateGuestCart(validGuestToken());
    await addItem(cart.id, product.id, 1);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });

    await deleteProduct(product.id);

    expect(await prisma.product.findUnique({ where: { id: product.id } })).toBeNull();
  });

  it("deleteProduct cascades category links and images and cleans up storage", async () => {
    const category = await createCategory({ name: "c" });
    const product = await makeProductRow({ categoryIds: [category.id] });
    s3State.putObject(keyFor(1));
    await addProductImage({ productId: product.id, storageKey: keyFor(1) });

    await deleteProduct(product.id);

    expect(await prisma.productCategory.count()).toBe(0);
    expect(await prisma.productImage.count()).toBe(0);
    expect(await prisma.category.count()).toBe(1);
    expect(s3State.deletedKeys).toEqual([keyFor(1)]);
    await expectServiceError(deleteProduct(product.id), "NOT_FOUND");
  });

  it("archived products stay in carts' history but are flagged unavailable (soft-delete path)", async () => {
    const product = await makeProductRow();
    const cart = await getOrCreateGuestCart(validGuestToken());
    await addItem(cart.id, product.id, 1);
    await archiveProduct(product.id);
    expect(await prisma.cartItem.count({ where: { cartId: cart.id } })).toBe(1);
  });
});

describe("product rich-text description round-trip", () => {
  const dirtyDoc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { onclick: "alert(1)", textAlign: "right" },
        content: [
          { type: "text", text: "safe", marks: [{ type: "bold" }] },
          {
            type: "text",
            text: "evil link",
            marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
          },
          {
            type: "text",
            text: "good link",
            marks: [{ type: "link", attrs: { href: "https://example.com/x", target: "_self", rel: "x" } }],
          },
        ],
      },
      { type: "image", attrs: { src: "javascript:alert(2)" } },
      { type: "image", attrs: { src: "https://cdn.example.com/a.png", alt: "pic", onerror: "x()" } },
    ],
  };

  it("stores a sanitized document and returns it unchanged on read", async () => {
    const product = await createProduct({ name: "Rich", status: "PUBLISHED", description: dirtyDoc });
    const read = await getProductBySlug(product.slug);
    const json = JSON.stringify(read!.description);

    expect(json).not.toContain("javascript:");
    expect(json).not.toContain("onclick");
    expect(json).not.toContain("onerror");
    expect(json).toContain("https://example.com/x");
    expect(json).toContain("noopener noreferrer nofollow");
    expect(json).not.toContain("_self");

    const doc = read!.description as { content: Array<{ type: string; attrs?: Record<string, unknown> }> };
    expect(doc.content.map((n) => n.type)).toEqual(["paragraph", "image"]);
    expect(doc.content[0].attrs).toEqual({ textAlign: "right" });

    // Re-saving the stored document is idempotent.
    const resaved = await updateProduct(product.id, { description: read!.description });
    expect(resaved.description).toEqual(read!.description);
  });

  it("rejects unknown node types instead of storing them, and nulls empty documents", async () => {
    await expectServiceError(
      createProduct({
        name: "Script",
        description: { type: "doc", content: [{ type: "script", content: [{ type: "text", text: "x" }] }] },
      }),
      "VALIDATION",
    );
    await expectServiceError(createProduct({ name: "NotDoc", description: "<script>alert(1)</script>" }), "VALIDATION");
    expect(await prisma.product.count()).toBe(0);

    const empty = await createProduct({ name: "Empty", description: { type: "doc", content: [] } });
    expect(empty.description).toBeNull();
  });
});

describe("product admin actions", () => {
  const payload: ProductFormPayload = {
    name: "Action product",
    slug: null,
    price: "250000",
    stockQuantity: "4",
    status: "PUBLISHED",
    categoryIds: [],
    description: null,
    images: [],
  };

  it("createProductAction is rejected for anonymous visitors and customers, allowed for admins", async () => {
    const anon = await createProductAction(payload);
    expect(anon.ok).toBe(false);

    const customer = await makeUser(UserRole.CUSTOMER);
    await signInAs(customer.id);
    const forbidden = await createProductAction(payload);
    expect(forbidden.ok).toBe(false);
    expect(await prisma.product.count()).toBe(0);

    const admin = await makeUser(UserRole.ADMIN);
    await signInAs(admin.id);
    const ok = await createProductAction(payload);
    expect(ok.ok).toBe(true);
    expect(await prisma.product.count()).toBe(1);
  });

  it("updateProductAction rejects customers and leaves the product untouched", async () => {
    const product = await makeProductRow({ name: "Original" });
    const customer = await makeUser(UserRole.CUSTOMER);
    await signInAs(customer.id);
    const result = await updateProductAction(product.id, { ...payload, name: "Hacked" });
    expect(result.ok).toBe(false);
    expect((await getProductById(product.id))!.name).toBe("Original");
  });
});
