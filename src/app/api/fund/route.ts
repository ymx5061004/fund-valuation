import { NextResponse } from "next/server";
import { fetchFundFull } from "@/lib/eastmoney";

// 按代码取单只基金完整数据：/api/fund?code=161725
export async function GET(request: Request) {
  const code = (new URL(request.url).searchParams.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return NextResponse.json({ data: null, error: "非法基金代码" }, { status: 400 });
  }
  const data = await fetchFundFull(code);
  return NextResponse.json({ data });
}
