import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ServiceError } from "@/lib/errors";
import { UserRole } from "@/generated/prisma/client";
import {
  MAX_UPLOAD_BYTES,
  generateObjectKey,
  isValidStorageKey,
  validateUploadRequest,
} from "@/lib/storage/s3";
import {
  confirmUpload,
  countMediaAssets,
  deleteMediaAsset,
  findMediaUsages,
  listMediaAssets,
  presignUpload,
  resolveAssetAssociation,
} from "@/features/media/service";
import {
  confirmUploadAction,
  deleteMediaAction,
  presignUploadAction,
} from "@/features/media/actions";
import { createCategoryAction } from "@/features/categories/actions";
import { AuthenticationError, AuthorizationError } from "@/features/auth/permissions";
import { makeProductRow, makeUser, rejection, signInAs } from "./helpers/factories";
import { s3State } from "./helpers/s3-mock";

const admin = { role: UserRole.ADMIN } as const;
const customer = { role: UserRole.CUSTOMER } as const;

const key = (n: number, purpose = "product", ext = "png") =>
  `${purpose}/${n.toString(16).padStart(24, "0")}-photo.${ext}`;

async function expectServiceError(promise: Promise<unknown>, code: ServiceError["code"]) {
  const error = await rejection(promise);
  expect(error).toBeInstanceOf(ServiceError);
  expect((error as ServiceError).code).toBe(code);
}

async function verifiedAsset(storageKey: string, purpose = "product") {
  s3State.putObject(storageKey);
  return prisma.mediaAsset.create({
    data: {
      storageKey,
      url: `https://s3.test.invalid/test-bucket/${storageKey}`,
      mimeType: "image/png",
      sizeBytes: 1024,
      purpose,
      verifiedAt: new Date(),
    },
  });
}

describe("validateUploadRequest / keys", () => {
  it("accepts jpeg, png and webp within the size limit", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(validateUploadRequest({ contentType, size: 1024 })).toEqual({ ok: true });
    }
    expect(validateUploadRequest({ contentType: "image/png", size: MAX_UPLOAD_BYTES })).toEqual({ ok: true });
  });

  it("rejects bad mime types", () => {
    for (const contentType of ["image/svg+xml", "image/gif", "text/html", "application/pdf", "", "IMAGE/PNG"]) {
      expect(validateUploadRequest({ contentType, size: 1024 }).ok).toBe(false);
    }
  });

  it("rejects oversized, empty, negative, fractional and non-finite sizes", () => {
    for (const size of [MAX_UPLOAD_BYTES + 1, 0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateUploadRequest({ contentType: "image/png", size }).ok).toBe(false);
    }
  });

  it("derives the extension from the validated mime, never from the file name", () => {
    const generated = generateObjectKey({ purpose: "product", fileName: "shell.php", contentType: "image/png" });
    expect(generated).toMatch(/^product\/[a-f0-9]{24}-shell\.png$/);
    expect(isValidStorageKey(generated)).toBe(true);
    expect(() => generateObjectKey({ purpose: "product", fileName: "a.exe", contentType: "application/x-msdownload" })).toThrow();
    expect(() =>
      generateObjectKey({ purpose: "secrets" as "product", fileName: "a.png", contentType: "image/png" }),
    ).toThrow();
  });

  it("isValidStorageKey rejects traversal, bad extensions and unknown prefixes", () => {
    expect(isValidStorageKey(key(1))).toBe(true);
    for (const bad of [
      "product/../x.png",
      key(1, "product", "svg"),
      key(1, "product", "exe"),
      key(1, "uploads"),
      `/${key(1)}`,
      "product/abc.png",
      `${key(1)}/extra`,
    ]) {
      expect(isValidStorageKey(bad)).toBe(false);
    }
  });
});

describe("presignUpload", () => {
  it("rejects non-admin actors (customer, anonymous)", async () => {
    const input = { purpose: "product", fileName: "a.png", contentType: "image/png", size: 100 } as const;
    expect(await rejection(presignUpload(customer, input))).toBeInstanceOf(AuthorizationError);
    expect(await rejection(presignUpload(null, input))).toBeInstanceOf(AuthenticationError);
    expect(await rejection(presignUpload(undefined, input))).toBeInstanceOf(AuthenticationError);
    expect(s3State.presignedCommands).toHaveLength(0);
  });

  it("validates mime, size and purpose for admins", async () => {
    const base = { purpose: "product", fileName: "a.png", contentType: "image/png", size: 100 } as const;
    await expectServiceError(presignUpload(admin, { ...base, contentType: "image/svg+xml" }), "VALIDATION");
    await expectServiceError(presignUpload(admin, { ...base, size: MAX_UPLOAD_BYTES + 1 }), "VALIDATION");
    await expectServiceError(presignUpload(admin, { ...base, size: 0 }), "VALIDATION");
    await expectServiceError(presignUpload(admin, { ...base, purpose: "avatar" as "product" }), "VALIDATION");
    expect(s3State.presignedCommands).toHaveLength(0);
  });

  it("returns a signed PUT bound to the declared type and size, under the purpose prefix", async () => {
    const result = await presignUpload(admin, {
      purpose: "category",
      fileName: "My Photo.JPG",
      contentType: "image/jpeg",
      size: 2048,
    });
    expect(result.key).toMatch(/^category\/[a-f0-9]{24}-my-photo\.jpg$/);
    expect(result.method).toBe("PUT");
    expect(s3State.presignedCommands[0]).toMatchObject({
      Key: result.key,
      ContentType: "image/jpeg",
      ContentLength: 2048,
      Bucket: "test-bucket",
    });
    // Presigning alone never creates a database record.
    expect(await prisma.mediaAsset.count()).toBe(0);
  });
});

describe("confirmUpload", () => {
  it("rejects non-admin actors", async () => {
    s3State.putObject(key(1));
    expect(await rejection(confirmUpload(customer, { purpose: "product", key: key(1) }))).toBeInstanceOf(AuthorizationError);
    expect(await rejection(confirmUpload(null, { purpose: "product", key: key(1) }))).toBeInstanceOf(AuthenticationError);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it("does not create a verified record when the object does not exist in storage", async () => {
    await expectServiceError(confirmUpload(admin, { purpose: "product", key: key(1) }), "VALIDATION");
    expect(await prisma.mediaAsset.count()).toBe(0);
    expect(s3State.headCalls).toEqual([key(1)]);
  });

  it("does not create a record for wrong content type, wrong size, or empty objects", async () => {
    s3State.putObject(key(1), { contentType: "text/html" });
    s3State.putObject(key(2), { size: MAX_UPLOAD_BYTES + 1 });
    s3State.putObject(key(3), { size: 0 });
    s3State.putObject(key(4), { contentType: null });
    for (const n of [1, 2, 3, 4]) {
      await expectServiceError(confirmUpload(admin, { purpose: "product", key: key(n) }), "VALIDATION");
    }
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it("rejects a key that does not match the declared purpose or is malformed (S3 never queried)", async () => {
    s3State.putObject(key(1, "category"));
    await expectServiceError(confirmUpload(admin, { purpose: "product", key: key(1, "category") }), "VALIDATION");
    await expectServiceError(confirmUpload(admin, { purpose: "product", key: "product/../../x.png" }), "VALIDATION");
    expect(s3State.headCalls).toHaveLength(0);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it("records a verified asset using server-measured size and type, idempotently", async () => {
    s3State.putObject(key(1), { size: 4096, contentType: "image/webp" });
    const first = await confirmUpload(admin, { purpose: "product", key: key(1) });
    const second = await confirmUpload(admin, { purpose: "product", key: key(1) });
    expect(second.id).toBe(first.id);

    const row = await prisma.mediaAsset.findUniqueOrThrow({ where: { id: first.id } });
    expect(row).toMatchObject({ sizeBytes: 4096, mimeType: "image/webp", purpose: "product" });
    expect(row.verifiedAt).not.toBeNull();
    expect(row.url).toBe(`https://s3.test.invalid/test-bucket/${key(1)}`);
  });

  it("a failing storage backend (non-404 error) does not create a record", async () => {
    // Objects map is empty and key invalid for S3 → exists:false path; emulate an outage instead.
    const original = s3State.objects.get;
    s3State.objects.get = () => {
      throw new Error("network down");
    };
    try {
      await expect(confirmUpload(admin, { purpose: "product", key: key(7) })).rejects.toThrow();
    } finally {
      s3State.objects.get = original;
    }
    expect(await prisma.mediaAsset.count()).toBe(0);
  });
});

describe("media server actions", () => {
  it("reject anonymous visitors and customers; nothing is presigned, recorded or deleted", async () => {
    const asset = await verifiedAsset(key(1));
    s3State.putObject(key(2));

    const attempts = async () => [
      await presignUploadAction({ purpose: "product", fileName: "a.png", contentType: "image/png", size: 10 }),
      await confirmUploadAction({ purpose: "product", key: key(2) }),
      await deleteMediaAction(asset.id),
    ];

    for (const result of await attempts()) expect(result.ok).toBe(false);

    const user = await makeUser(UserRole.CUSTOMER);
    await signInAs(user.id);
    for (const result of await attempts()) expect(result.ok).toBe(false);

    expect(s3State.presignedCommands).toHaveLength(0);
    expect(s3State.deletedKeys).toHaveLength(0);
    expect(await prisma.mediaAsset.count()).toBe(1);
  });

  it("work for admins end to end", async () => {
    const user = await makeUser(UserRole.ADMIN);
    await signInAs(user.id);

    const presigned = await presignUploadAction({
      purpose: "product",
      fileName: "x.png",
      contentType: "image/png",
      size: 1000,
    });
    expect(presigned.ok).toBe(true);
    if (!presigned.ok) return;

    s3State.putObject(presigned.data.key, { size: 1000 });
    const confirmed = await confirmUploadAction({ purpose: "product", key: presigned.data.key });
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;

    expect((await deleteMediaAction(confirmed.data.id)).ok).toBe(true);
    expect(s3State.deletedKeys).toEqual([presigned.data.key]);
    expect(await prisma.mediaAsset.count()).toBe(0);
  });

  it("createCategoryAction cannot attach an unverified or foreign-purpose image", async () => {
    const user = await makeUser(UserRole.ADMIN);
    await signInAs(user.id);

    s3State.putObject(key(1, "category"));
    const unverified = await createCategoryAction({ name: "A", imageKey: key(1, "category") });
    expect(unverified.ok).toBe(false);

    await verifiedAsset(key(2, "product"), "product");
    const wrongPurpose = await createCategoryAction({ name: "B", imageKey: key(2, "product") });
    expect(wrongPurpose.ok).toBe(false);
    expect(await prisma.category.count()).toBe(0);

    await verifiedAsset(key(3, "category"), "category");
    const ok = await createCategoryAction({ name: "C", imageKey: key(3, "category") });
    expect(ok.ok).toBe(true);
    const category = await prisma.category.findFirstOrThrow();
    expect(category.imageKey).toBe(key(3, "category"));
    // URL comes from the verified asset, not from the client.
    expect(category.imageUrl).toBe(`https://s3.test.invalid/test-bucket/${key(3, "category")}`);
  });
});

describe("resolveAssetAssociation", () => {
  it("requires an admin, handles clear/unchanged, and demands a verified asset of the same purpose", async () => {
    expect(await rejection(resolveAssetAssociation(customer, key(1, "logo"), "logo"))).toBeInstanceOf(AuthorizationError);
    expect(await resolveAssetAssociation(admin, undefined, "logo")).toBeUndefined();
    expect(await resolveAssetAssociation(admin, null, "logo")).toEqual({ imageKey: null, imageUrl: null });
    expect(await resolveAssetAssociation(admin, "  ", "logo")).toEqual({ imageKey: null, imageUrl: null });

    await expectServiceError(resolveAssetAssociation(admin, key(1, "logo"), "logo"), "VALIDATION");
    await prisma.mediaAsset.create({
      data: { storageKey: key(1, "logo"), url: "u", mimeType: "image/png", sizeBytes: 1, purpose: "logo", verifiedAt: null },
    });
    await expectServiceError(resolveAssetAssociation(admin, key(1, "logo"), "logo"), "VALIDATION");
    await prisma.mediaAsset.updateMany({ data: { verifiedAt: new Date() } });
    expect(await resolveAssetAssociation(admin, key(1, "logo"), "logo")).toEqual({
      imageKey: key(1, "logo"),
      imageUrl: "u",
    });
  });
});

describe("deleteMediaAsset", () => {
  it("rejects non-admin actors and leaves the asset and object alone", async () => {
    const asset = await verifiedAsset(key(1));
    expect(await rejection(deleteMediaAsset(customer, { id: asset.id }))).toBeInstanceOf(AuthorizationError);
    expect(await rejection(deleteMediaAsset(null, { id: asset.id }))).toBeInstanceOf(AuthenticationError);
    expect(await prisma.mediaAsset.count()).toBe(1);
    expect(s3State.deletedKeys).toHaveLength(0);
  });

  it("deletes an unused asset: object first, then the record", async () => {
    const asset = await verifiedAsset(key(1));
    await deleteMediaAsset(admin, { id: asset.id });
    expect(s3State.deletedKeys).toEqual([key(1)]);
    expect(await prisma.mediaAsset.count()).toBe(0);
    await expectServiceError(deleteMediaAsset(admin, { id: asset.id }), "NOT_FOUND");
  });

  it("refuses keys outside their purpose prefix (tampered record) and never calls S3", async () => {
    const mismatched = await prisma.mediaAsset.create({
      data: { storageKey: key(1, "category"), url: "u", mimeType: "image/png", sizeBytes: 1, purpose: "product" },
    });
    const malformed = await prisma.mediaAsset.create({
      data: { storageKey: "logo/../../other-bucket-object.png", url: "u", mimeType: "image/png", sizeBytes: 1, purpose: "logo" },
    });
    const badPurpose = await prisma.mediaAsset.create({
      data: { storageKey: key(2), url: "u", mimeType: "image/png", sizeBytes: 1, purpose: "secrets" },
    });
    for (const asset of [mismatched, malformed, badPurpose]) {
      await expectServiceError(deleteMediaAsset(admin, { id: asset.id }), "FORBIDDEN");
    }
    expect(s3State.deletedKeys).toHaveLength(0);
    expect(await prisma.mediaAsset.count()).toBe(3);
  });

  it("refuses to delete an asset used as a product image", async () => {
    const asset = await verifiedAsset(key(1));
    const product = await makeProductRow();
    await prisma.productImage.create({
      data: { productId: product.id, storageKey: key(1), url: asset.url },
    });
    await expectServiceError(deleteMediaAsset(admin, { id: asset.id }), "CONFLICT");
    expect(s3State.deletedKeys).toHaveLength(0);
    expect(await prisma.mediaAsset.count()).toBe(1);
  });

  it("refuses to delete an asset used as a category image or the store logo", async () => {
    const categoryAsset = await verifiedAsset(key(1, "category"), "category");
    await prisma.category.create({
      data: { name: "c", slug: "c", imageKey: categoryAsset.storageKey, imageUrl: categoryAsset.url },
    });
    await expectServiceError(deleteMediaAsset(admin, { id: categoryAsset.id }), "CONFLICT");

    const logoAsset = await verifiedAsset(key(2, "logo"), "logo");
    await prisma.storeSettings.create({ data: { id: "default", logoKey: logoAsset.storageKey, logoUrl: logoAsset.url } });
    await expectServiceError(deleteMediaAsset(admin, { id: logoAsset.id }), "CONFLICT");
    expect(s3State.deletedKeys).toHaveLength(0);
  });

  it("refuses to delete an asset embedded in a product's rich-text description", async () => {
    const asset = await verifiedAsset(key(1, "editor"), "editor");
    const product = await makeProductRow();
    await prisma.product.update({
      where: { id: product.id },
      data: {
        description: { type: "doc", content: [{ type: "image", attrs: { src: asset.url } }] },
      },
    });
    const usages = (await findMediaUsages([asset.storageKey])).get(asset.storageKey);
    expect(usages).toEqual([{ type: "editor", id: product.id, name: product.name }]);
    await expectServiceError(deleteMediaAsset(admin, { id: asset.id }), "CONFLICT");
    expect(await prisma.mediaAsset.count()).toBe(1);
  });

  it("keeps the record when the storage delete fails so it can be retried", async () => {
    const asset = await verifiedAsset(key(1));
    s3State.failDelete = true;
    await expectServiceError(deleteMediaAsset(admin, { id: asset.id }), "INTERNAL");
    expect(await prisma.mediaAsset.count()).toBe(1);

    s3State.failDelete = false;
    await deleteMediaAsset(admin, { id: asset.id });
    expect(await prisma.mediaAsset.count()).toBe(0);
  });
});

describe("media library", () => {
  it("lists with usages and filters by purpose; admin only", async () => {
    const used = await verifiedAsset(key(1));
    await verifiedAsset(key(2, "category"), "category");
    const product = await makeProductRow({ name: "Lamp" });
    await prisma.productImage.create({ data: { productId: product.id, storageKey: key(1), url: used.url } });

    expect(await rejection(listMediaAssets(customer))).toBeInstanceOf(AuthorizationError);
    expect(await rejection(countMediaAssets(customer))).toBeInstanceOf(AuthorizationError);

    const all = await listMediaAssets(admin);
    expect(all.total).toBe(2);
    const usedItem = all.items.find((i) => i.storageKey === key(1))!;
    expect(usedItem.usages).toEqual([{ type: "product", id: product.id, name: "Lamp" }]);

    const onlyCategory = await listMediaAssets(admin, { purpose: "category" });
    expect(onlyCategory.items.map((i) => i.storageKey)).toEqual([key(2, "category")]);
    expect(await countMediaAssets(admin)).toBe(2);
  });
});
