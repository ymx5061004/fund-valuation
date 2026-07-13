import { NextResponse } from "next/server";
import { fetchIndexDetail, SECID_RE } from "@/lib/eastmoney";

// 指数详情：/api/index?secid=1.000001
export async function GET(request: Request) {
  const secid = (new URL(request.url).searchParams.get("secid") ?? "").trim();
  if (!SECID_RE.test(secid)) return NextResponse.json({ data: null, error: "非法 secid" }, { status: 400 });
  const data = await fetchIndexDetail(secid);
  return NextResponse.json({ data });
}
