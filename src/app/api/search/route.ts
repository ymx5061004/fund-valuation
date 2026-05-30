import { NextResponse } from "next/server";
import { searchFunds } from "@/lib/eastmoney";

// 基金搜索：/api/search?key=白酒 或 ?key=161725
export async function GET(request: Request) {
  const key = (new URL(request.url).searchParams.get("key") ?? "").trim();
  if (!key) return NextResponse.json({ data: [] });
  const data = await searchFunds(key);
  return NextResponse.json({ data });
}
