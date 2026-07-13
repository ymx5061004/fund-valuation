import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { searchFunds } from "@/lib/eastmoney";
import { FundDetail } from "@/components/fund-detail";

// 基金详情页 /fund/[code]（Next 16：params 为 Promise，需 await）

export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) return { title: "基金详情" };
  try {
    // searchFunds 有 1h 缓存，几乎零额外开销；失败回退代码标题，不阻塞页面
    const metas = await searchFunds(code);
    const name = metas.find((m) => m.code === code)?.name;
    return { title: name ? `${name}(${code}) 净值估值` : `基金${code}` };
  } catch {
    return { title: `基金${code}` };
  }
}

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  if (!/^\d{6}$/.test(code)) notFound(); // 与 /api/fund 校验口径一致
  return <FundDetail code={code} />;
}
