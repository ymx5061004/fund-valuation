import { NextResponse } from "next/server";
import { fetchQuoteMetrics, mapWithLimit, parseCodes } from "@/lib/eastmoney";

// 自选多指标：/api/quotes?codes=012414,000217
export async function GET(request: Request) {
  const codes = parseCodes(new URL(request.url).searchParams.get("codes"));
  const results = await mapWithLimit(codes, 6, (c) => fetchQuoteMetrics(c));
  const data = results.filter(Boolean);
  // 入参合法却一条都没取到 → 视为上游故障返回 503，让客户端保留已展示数据而非清空
  if (codes.length > 0 && data.length === 0) {
    return NextResponse.json({ data: [], error: "上游接口暂不可用" }, { status: 503 });
  }
  return NextResponse.json({ data });
}
