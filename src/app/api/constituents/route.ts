import { NextResponse } from "next/server";
import { fetchConstituents, SECID_RE } from "@/lib/eastmoney";

// /api/constituents?secid=1.000001&pn=1
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const secid = (sp.get("secid") ?? "").trim();
  // pn 取正整数并设上限（沪市约 1700 只 / 每页 10 条 ≈ 170 页，300 留足余量）
  const pn = Math.min(300, Math.max(1, Math.trunc(Number(sp.get("pn")) || 1)));
  if (!SECID_RE.test(secid)) return NextResponse.json({ stocks: [], total: 0 }, { status: 400 });
  const r = await fetchConstituents(secid, pn, 10);
  return NextResponse.json(r ?? { stocks: [], total: 0 });
}
