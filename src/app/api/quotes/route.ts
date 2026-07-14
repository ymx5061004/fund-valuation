import { NextResponse } from "next/server";
import { fetchEstimatesBatch, fetchQuoteMetrics, mapWithLimit, parseCodes } from "@/lib/eastmoney";

// 自选多指标：/api/quotes?codes=012414,000217
export async function GET(request: Request) {
  const codes = parseCodes(new URL(request.url).searchParams.get("codes"));
  // 估值先整批取一次（主源失败时新浪兜底是一次批量而非逐只），再传入各基金的指标计算
  const ests = new Map((await fetchEstimatesBatch(codes)).map((e) => [e.code, e]));
  const results = await mapWithLimit(codes, 6, (c) => fetchQuoteMetrics(c, ests.get(c) ?? null));
  const data = results.filter(Boolean);
  // 入参合法却一条都没取到 → 视为上游故障返回 503，让客户端保留已展示数据而非清空
  if (codes.length > 0 && data.length === 0) {
    return NextResponse.json({ data: [], error: "上游接口暂不可用" }, { status: 503 });
  }
  return NextResponse.json({ data });
}
