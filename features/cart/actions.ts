"use server";

import {
  actionError,
  actionOk,
  toActionError,
  type ActionResult,
} from "@/lib/action-result";
import { getCurrentUser } from "@/features/auth/session";
import { getGuestCartToken, setGuestCartToken } from "@/features/cart/guest-cookie";
import {
  addItem,
  getOrCreateGuestCart,
  getOrCreateUserCart,
  removeItem,
  updateQuantity,
} from "@/features/cart/service";

const INVALID_INPUT = "اطلاعات واردشده معتبر نیست.";

function isValidId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 64;
}

/**
 * Resolves (and creates if needed) the cart of the current visitor:
 * signed-in users get their user cart, everybody else a guest cart bound to
 * an httpOnly cookie. Only callable from Server Actions (it may set cookies).
 */
async function resolveCartId(): Promise<string> {
  const user = await getCurrentUser();
  if (user) return (await getOrCreateUserCart(user.id)).id;

  const existingToken = await getGuestCartToken();
  const token = existingToken ?? (await setGuestCartToken());
  return (await getOrCreateGuestCart(token)).id;
}

/** Price, stock and publication status are re-validated by the cart service. */
export async function addToCartAction(
  productId: string,
  quantity = 1,
): Promise<ActionResult> {
  if (!isValidId(productId) || typeof quantity !== "number") {
    return actionError(INVALID_INPUT);
  }
  try {
    const cartId = await resolveCartId();
    await addItem(cartId, productId, quantity);
    return actionOk(null);
  } catch (error) {
    return toActionError(error);
  }
}

/** Sets an absolute quantity; a quantity <= 0 removes the item. */
export async function updateCartItemAction(
  productId: string,
  quantity: number,
): Promise<ActionResult> {
  if (!isValidId(productId) || typeof quantity !== "number") {
    return actionError(INVALID_INPUT);
  }
  try {
    const cartId = await resolveCartId();
    await updateQuantity(cartId, productId, quantity);
    return actionOk(null);
  } catch (error) {
    return toActionError(error);
  }
}

export async function removeCartItemAction(productId: string): Promise<ActionResult> {
  if (!isValidId(productId)) return actionError(INVALID_INPUT);
  try {
    const cartId = await resolveCartId();
    await removeItem(cartId, productId);
    return actionOk(null);
  } catch (error) {
    return toActionError(error);
  }
}
