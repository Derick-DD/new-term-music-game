import type { Metadata } from "next";
import "./globals.css";

const title = "开学冲冲冲！";
const description =
  "跟着歌曲节拍收集知识，从自行车一路升级到校车，解锁你的新学期隐藏人设。";

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://fan-bus-rhythm-rush-campus.derick-dcr.chatgpt.site",
  ),
  title,
  description,
  openGraph: {
    title,
    description,
    type: "website",
    url: "/",
    images: [
      {
        url: "/og-sites.png",
        width: 1734,
        height: 907,
        alt: "开学冲冲冲校园节奏游戏",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/og-sites.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
