import { NextResponse } from "next/server";
import { searchFunds } from "@/lib/eastmoney";

// 基金搜索：/api/search?key=白酒 或 ?key=161725
export async function GET(request: Request) {
  // 基金代码 6 位、名称不超 20 字，32 足够；走 1h 缓存路径，重复关键词不再回源
  const key = (new URL(request.url).searchParams.get("key") ?? "").trim().slice(0, 32);
  if (!key) return NextResponse.json({ data: [] });
  const data = await searchFunds(key);
  return NextResponse.json({ data });
}
