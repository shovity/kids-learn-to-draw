import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import { BASE } from "@/lib/manifest";
import "./globals.css";

// app gốc dùng Roboto
const font = Roboto({ subsets: ["latin", "vietnamese"], weight: ["400", "500", "700"] });

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
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <body className={font.className}>{children}</body>
    </html>
  );
}
