import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

const title = "开学冲冲冲！";
const description =
  "跟着歌曲节拍收集知识，从自行车一路升级到校车，解锁你的新学期隐藏人设。";

export const metadata: Metadata = {
  metadataBase: new URL(
    "https://y.qq.com/viber_pub/campus_gogogo/",
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
        url: "/og.png",
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
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <Script
          src="https://y.qq.com/lib/commercial/h5/polyfill.min.js?max_age=2592000"
          strategy="beforeInteractive"
        />
        <Script
          src="https://y.qq.com/lib/h5/preact.js?max_age=2592000"
          strategy="beforeInteractive"
        />
        <Script
          src="https://y.qq.com/lib/h5/music.js?max_age=604800"
          strategy="beforeInteractive"
        />
        <Script id="qq-music-global-compat" strategy="beforeInteractive">
          {`window.Music = window.Music || window.M;`}
        </Script>
        <Script
          src="https://y.qq.com/component/m/qmfe-unity-report/iife/index.js?max_age=2592000"
          strategy="beforeInteractive"
        />
        <Script
          src="https://y.qq.com/component/m/fixTopBar/dist/fixTopBar.js?max_age=2592000"
          strategy="beforeInteractive"
        />
        <Script
          src="https://y.qq.com/component/m/qmplayer/qmplayer.music.js?max_age=604800"
          strategy="beforeInteractive"
        />
        <Script
          src="/activity.config.js"
          strategy="beforeInteractive"
        />
        <Script src="/activity-bridge.js" strategy="beforeInteractive" />
        {children}
      </body>
    </html>
  );
}
