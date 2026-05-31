import { NextResponse } from "next/server";
import { fetchIndexDetail } from "@/lib/eastmoney";

// 指数详情：/api/index?secid=1.000001
export async function GET(request: Request) {
  const secid = (new URL(request.url).searchParams.get("secid") ?? "").trim();
  if (!secid) return NextResponse.json({ data: null, error: "缺少 secid" }, { status: 400 });
  const data = await fetchIndexDetail(secid);
  return NextResponse.json({ data });
}
