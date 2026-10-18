import type { Metadata, Viewport } from "next";
import { Baloo_2 } from "next/font/google";
import { BASE } from "@/lib/manifest";
import "./globals.css";

const font = Baloo_2({ subsets: ["latin", "vietnamese"], weight: ["500", "600", "700", "800"] });

export const metadata: Metadata = {
  title: "Bé Học Vẽ",
  description: "Bé học vẽ từng nét, tô màu và treo tranh — chạy ngay trên trình duyệt",
  manifest: `${BASE}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "Bé Học Vẽ", statusBarStyle: "default" },
  icons: { icon: `${BASE}/icon-192.png`, apple: `${BASE}/apple-touch-icon.png` },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#ffb23f",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={font.className}>{children}</body>
    </html>
  );
}
