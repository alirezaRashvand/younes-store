import type { Metadata, Viewport } from "next";
import { vazirmatn } from "@/lib/fonts";
import { DirectionProvider } from "@/components/ui/direction-provider";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "یونس | فروشگاه تجهیزات سرمایشی و گرمایشی",
    template: "%s | یونس",
  },
  description:
    "فروشگاه یونس؛ عرضه لوازم خانگی، تجهیزات سرمایشی و گرمایشی با مشخصات دقیق و پشتیبانی تلفنی.",
  applicationName: "یونس",
};

export const viewport: Viewport = {
  themeColor: "#2b4264",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fa"
      dir="rtl"
      data-scroll-behavior="smooth"
      className={`${vazirmatn.variable} h-full`}
    >
      <body className="flex min-h-full flex-col">
        <DirectionProvider dir="rtl">{children}</DirectionProvider>
        <Toaster richColors position="top-center" dir="rtl" />
      </body>
    </html>
  );
}
