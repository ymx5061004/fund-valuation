import { NextResponse } from "next/server";
import { fetchEstimatesBatch, parseCodes } from "@/lib/eastmoney";

// 轻量实时估值接口，供客户端轮询：/api/estimate?codes=161725,005827
// 天天基金主源 → 新浪批量兜底 → 10 分钟内旧值（见 fetchEstimatesBatch）。
export async function GET(request: Request) {
  const codes = parseCodes(new URL(request.url).searchParams.get("codes"));
  const data = await fetchEstimatesBatch(codes);
  return NextResponse.json({
    data,
    updatedAt: new Date().toISOString(),
  });
}
