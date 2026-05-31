import { NextResponse } from "next/server";
import { fetchKline, fetchTrend } from "@/lib/eastmoney";

// /api/kline?secid=1.000001&type=d|w|m|5d
const KLT: Record<string, number> = { d: 101, w: 102, m: 103 };

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const secid = (sp.get("secid") ?? "").trim();
  const type = sp.get("type") ?? "d";
  if (!secid) return NextResponse.json({ kind: "none" }, { status: 400 });
  if (type === "5d") {
    const line = await fetchTrend(secid, 5);
    return NextResponse.json({ kind: "line", line });
  }
  const candle = await fetchKline(secid, KLT[type] ?? 101);
  return NextResponse.json({ kind: "candle", candle });
}
