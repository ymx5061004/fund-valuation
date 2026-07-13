import type { MetadataRoute } from "next";

// PWA manifest：支持「添加到主屏幕」以独立窗口打开
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "基金估值与涨跌预测系统",
    short_name: "基金估值",
    description: "盘中实时估值、净值走势与技术指标涨跌研判",
    lang: "zh-CN",
    start_url: "/",
    display: "standalone",
    background_color: "#fafafa",
    theme_color: "#fafafa",
    icons: [
      { src: "/icon.png", sizes: "512x512", type: "image/png" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
