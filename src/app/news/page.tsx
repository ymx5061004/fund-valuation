import type { Metadata } from "next";
import { NewsView } from "@/components/news-view";

export const metadata: Metadata = { title: "资讯" };

export default function Page() {
  return <NewsView />;
}
