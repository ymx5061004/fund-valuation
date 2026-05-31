import { NextResponse } from "next/server";
import { fetchConstituents } from "@/lib/eastmoney";

// /api/constituents?secid=1.000001&pn=1
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const secid = (sp.get("secid") ?? "").trim();
  const pn = Math.max(1, Number(sp.get("pn")) || 1);
  if (!secid) return NextResponse.json({ stocks: [], total: 0 }, { status: 400 });
  const r = await fetchConstituents(secid, pn, 10);
  return NextResponse.json(r ?? { stocks: [], total: 0 });
}
