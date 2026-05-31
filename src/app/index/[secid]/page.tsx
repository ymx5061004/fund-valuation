import { IndexDetailView } from "@/components/index-detail";

// 指数详情页 /index/[secid]（secid 如 1.000001）
export default async function Page({ params }: { params: Promise<{ secid: string }> }) {
  const { secid } = await params;
  return <IndexDetailView secid={decodeURIComponent(secid)} />;
}
