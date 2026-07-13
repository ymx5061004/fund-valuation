import { NextResponse } from "next/server";
import { fetchKline, fetchTrend, SECID_RE } from "@/lib/eastmoney";

// /api/kline?secid=1.000001&type=d|w|m|5d
const KLT: Record<string, number> = { d: 101, w: 102, m: 103 };

export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const secid = (sp.get("secid") ?? "").trim();
  const type = sp.get("type") ?? "d";
  if (!SECID_RE.test(secid)) return NextResponse.json({ kind: "none", error: "非法 secid" }, { status: 400 });
  // type 白名单：非法值返回 400 而非静默按日 K，避免调用方拿到与请求不符的数据
  if (type !== "5d" && !(type in KLT)) {
    return NextResponse.json({ kind: "none", error: "非法 type" }, { status: 400 });
  }
  if (type === "5d") {
    const line = await fetchTrend(secid, 5);
    return NextResponse.json({ kind: "line", line });
  }
  const candle = await fetchKline(secid, KLT[type]);
  return NextResponse.json({ kind: "candle", candle });
}
