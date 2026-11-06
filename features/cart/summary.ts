import "server-only";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/features/auth/session";
import { getGuestCartToken } from "@/features/cart/guest-cookie";
import { findGuestCart, getCartView } from "@/features/cart/service";

/**
 * Read-only cart unit count for the current request (header badge).
 * Never creates carts or mutates cookies. Reads cookies, so callers must sit
 * behind a <Suspense> boundary when `cacheComponents` is enabled.
 */
export async function getCurrentCartItemCount(): Promise<number> {
  const user = await getCurrentUser();

  let cartId: string | null = null;
  if (user) {
    const cart = await prisma.cart.findUnique({
      where: { userId: user.id },
      select: { id: true },
    });
    cartId = cart?.id ?? null;
  } else {
    const token = await getGuestCartToken();
    if (token) cartId = (await findGuestCart(token))?.id ?? null;
  }

  if (!cartId) return 0;
  return (await getCartView(cartId)).itemCount;
}
