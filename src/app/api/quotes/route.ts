import { NextResponse } from "next/server";
import { fetchQuoteMetrics } from "@/lib/eastmoney";

// 自选多指标：/api/quotes?codes=012414,000217
export async function GET(request: Request) {
  const codes = (new URL(request.url).searchParams.get("codes") ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)
    .slice(0, 50);
  const results = await Promise.all(codes.map((c) => fetchQuoteMetrics(c)));
  return NextResponse.json({ data: results.filter(Boolean) });
}
