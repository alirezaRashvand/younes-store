import "server-only";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/features/auth/session";
import { getGuestCartToken } from "@/features/cart/guest-cookie";
import { findGuestCart, getCartView, type CartView } from "@/features/cart/service";

/**
 * Read-only view of the current visitor's cart (user cart when signed in,
 * otherwise the guest cart). Returns null when no cart exists yet and never
 * creates carts or mutates cookies, so it is safe in Server Components.
 *
 * Reads cookies: the caller must render dynamically (Suspense / loading.tsx).
 */
export async function getCurrentCartView(): Promise<CartView | null> {
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

  return cartId ? getCartView(cartId) : null;
}
