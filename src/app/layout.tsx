import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabBar } from "@/components/tab-bar";

// 不用 next/font/google：fonts.gstatic.com 国内常被墙/超时，会导致构建或运行失败。
// 直接用系统字体（中文本就走系统字体），更稳。

export const metadata: Metadata = {
  title: "基金估值与涨跌预测系统",
  description: "盘中实时估值、基于技术指标的涨跌方向研判，移动端与 PC 自适应。",
};

// 移动端自适应的前提：声明 viewport
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full">
        <div className="pb-16">{children}</div>
        <TabBar />
      </body>
    </html>
  );
}
