import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { PWARegister } from "@shared/components/PWARegister";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Premium SEO Metadata
export const metadata: Metadata = {
  title: "서면 실시간 빈자리 예약 플랫폼 - Seomyeon Reservation",
  description: "부산 서면 술집 실시간 빈자리 현황을 확인하고 10초 만에 예약할 수 있는 초고속 모바일 PWA 예약 앱",
  keywords: ["서면 술집", "서면 빈자리", "실시간 예약", "이자카야", "부산 야키토리", "서면 포차"],
  manifest: "/manifest.json",
  icons: {
    icon: "/icons/icon-192x192.png",
    apple: "/icons/icon-192x192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "서면빈자리",
  },
};

// Next.js 15 viewport export configuration
export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-[#0B0B0C] text-slate-100 min-h-screen selection:bg-purple-500 selection:text-black`}
      >
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
