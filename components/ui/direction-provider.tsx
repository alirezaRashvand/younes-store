"use client";

import { DirectionProvider as RadixDirectionProvider } from "@radix-ui/react-direction";

/** Makes every Radix primitive (menus, selects, tabs, sliders…) RTL-aware. */
export function DirectionProvider({
  dir = "rtl",
  children,
}: {
  dir?: "rtl" | "ltr";
  children: React.ReactNode;
}) {
  return <RadixDirectionProvider dir={dir}>{children}</RadixDirectionProvider>;
}
