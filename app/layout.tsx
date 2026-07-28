import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "https";
  const baseUrl = host ? `${protocol}://${host}` : "http://localhost:3000";
  const shareImage = new URL("/og.png", baseUrl).toString();

  return {
    metadataBase: new URL(baseUrl),
    title: "星光巡演｜音轨追光小游戏",
    description:
      "驾驶明星巡演大巴贴住星光音轨，接粉丝、收集应援棒、避开路障，解锁你的演唱会规模。",
    openGraph: {
      title: "星光巡演｜一路向北 · 音轨追光挑战",
      description: "贴住音轨，让音乐响起来。接走粉丝，开向万人体育场。",
      images: [{ url: shareImage, width: 1200, height: 630, alt: "星光巡演游戏分享封面" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "星光巡演｜音轨追光挑战",
      description: "驾驶巡演大巴，在星光之路上接粉丝、躲路障。",
      images: [shareImage],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
