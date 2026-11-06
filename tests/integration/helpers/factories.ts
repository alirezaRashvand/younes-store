import { prisma } from "@/lib/db";
import { generateToken, sha256 } from "@/lib/crypto";
import { PublicationStatus, UserRole } from "@/generated/prisma/client";
import { SESSION_COOKIE_NAME } from "@/features/auth/session";
import { cookieJar } from "./cookie-jar";

let counter = 0;
const next = () => ++counter;

export async function makeUser(role: UserRole = UserRole.CUSTOMER, name: string | null = null) {
  const n = String(next()).padStart(7, "0");
  return prisma.user.create({
    data: { phoneNumber: `0912${n}`, role, name },
  });
}

/** Inserts a session row (only the sha256 of the token is stored) and returns the raw token. */
export async function makeSession(
  userId: string,
  opts: { expiresAt?: Date; revokedAt?: Date | null } = {},
): Promise<string> {
  const token = generateToken(32);
  await prisma.session.create({
    data: {
      userId,
      hashedToken: sha256(token),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000),
      revokedAt: opts.revokedAt ?? null,
    },
  });
  return token;
}

/** Signs a user in: creates a session row and puts the raw token in the mocked cookie jar. */
export async function signInAs(userId: string, opts: Parameters<typeof makeSession>[1] = {}) {
  const token = await makeSession(userId, opts);
  cookieJar.set(SESSION_COOKIE_NAME, token, { httpOnly: true });
  return token;
}

export async function makeCategoryRow(name: string, parentId: string | null = null) {
  const n = next();
  return prisma.category.create({
    data: { name, slug: `cat-${n}`, parentId },
  });
}

export async function makeProductRow(
  overrides: {
    name?: string;
    slug?: string;
    price?: bigint | null;
    stockQuantity?: number;
    status?: PublicationStatus;
    categoryIds?: string[];
  } = {},
) {
  const n = next();
  const { categoryIds = [], ...rest } = overrides;
  return prisma.product.create({
    data: {
      name: rest.name ?? `Product ${n}`,
      slug: rest.slug ?? `product-${n}`,
      price: rest.price === undefined ? BigInt(100_000) : rest.price,
      stockQuantity: rest.stockQuantity ?? 10,
      status: rest.status ?? PublicationStatus.PUBLISHED,
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
    },
  });
}

export function validGuestToken(): string {
  return generateToken(32);
}

/** Await a promise that is expected to reject and return the error. */
export async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the promise to reject, but it resolved.");
}
