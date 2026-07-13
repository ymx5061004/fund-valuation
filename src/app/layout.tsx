import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabBar } from "@/components/tab-bar";

// 不用 next/font/google：fonts.gstatic.com 国内常被墙/超时，会导致构建或运行失败。
// 直接用系统字体（中文本就走系统字体），更稳。

export const metadata: Metadata = {
  title: { default: "基金估值与涨跌预测系统", template: "%s - 基金估值" },
  description: "盘中实时估值、基于技术指标的涨跌方向研判，移动端与 PC 自适应。",
};

// 移动端自适应的前提：声明 viewport
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 状态栏/地址栏颜色跟随系统主题（手动切换主题时由浏览器按 media 匹配，覆盖多数场景）
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#09090b" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning：防闪烁脚本会在注水前给 <html> 加 .dark
    <html lang="zh-CN" className="h-full antialiased" suppressHydrationWarning>
      <body className="min-h-full">
        {/* 首屏前按 localStorage('fv.theme')/系统偏好设置暗色，避免主题闪烁（与 lib/theme.ts 逻辑一致） */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              '(function(){try{var t=localStorage.getItem("fv.theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();',
          }}
        />
        <div className="pb-16">{children}</div>
        <TabBar />
      </body>
    </html>
  );
}
