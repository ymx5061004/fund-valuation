import { NextResponse } from "next/server";
import { fetchEstimate } from "@/lib/eastmoney";

// 轻量实时估值接口，供客户端轮询：/api/estimate?codes=161725,005827
// 只回源 fundgz（数据小），不取历史净值。
export async function GET(request: Request) {
  const codes = (new URL(request.url).searchParams.get("codes") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 50); // 上限保护

  const results = await Promise.all(codes.map((c) => fetchEstimate(c, true)));
  return NextResponse.json({
    data: results.filter(Boolean),
    updatedAt: new Date().toISOString(),
  });
}
