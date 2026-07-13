import { NextResponse } from "next/server";
import { fetchEstimate, mapWithLimit, parseCodes } from "@/lib/eastmoney";

// 轻量实时估值接口，供客户端轮询：/api/estimate?codes=161725,005827
// 只回源 fundgz（数据小），不取历史净值。
export async function GET(request: Request) {
  const codes = parseCodes(new URL(request.url).searchParams.get("codes"));
  const results = await mapWithLimit(codes, 8, (c) => fetchEstimate(c, true));
  return NextResponse.json({
    data: results.filter(Boolean),
    updatedAt: new Date().toISOString(),
  });
}
