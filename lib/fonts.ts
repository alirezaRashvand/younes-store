import { Vazirmatn } from "next/font/google";

/** Variable Persian/Latin font. Exposed as `--font-vazirmatn` and wired into `--font-sans`. */
export const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-vazirmatn",
});
