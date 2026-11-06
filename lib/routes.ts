/** Central place for internal URLs so components never hard-code paths. */
export const routes = {
  home: "/",
  products: "/products",
  product: (slug: string) => `/products/${encodeURIComponent(slug)}`,
  categories: "/categories",
  search: "/search",
  category: (slug: string) => `/categories/${encodeURIComponent(slug)}`,
  cart: "/cart",
  login: "/login",
  account: "/account",
  admin: {
    root: "/admin",
    products: "/admin/products",
    productNew: "/admin/products/new",
    productEdit: (id: string) => `/admin/products/${encodeURIComponent(id)}/edit`,
    categories: "/admin/categories",
    media: "/admin/media",
    settings: "/admin/settings",
  },
} as const;
