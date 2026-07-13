import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SECID_RE } from "@/lib/eastmoney";
import { IndexDetailView } from "@/components/index-detail";

export const metadata: Metadata = { title: "指数行情" };

// 指数详情页 /index/[secid]（secid 如 1.000001）
export default async function Page({ params }: { params: Promise<{ secid: string }> }) {
  const { secid } = await params;
  const decoded = decodeURIComponent(secid);
  if (!SECID_RE.test(decoded)) notFound();
  return <IndexDetailView secid={decoded} />;
}
