import { FundDetail } from "@/components/fund-detail";

// 基金详情页 /fund/[code]（Next 16：params 为 Promise，需 await）
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <FundDetail code={code} />;
}
