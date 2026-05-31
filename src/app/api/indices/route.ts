import { NextResponse } from "next/server";
import { fetchIndices } from "@/lib/eastmoney";

// 大盘指数实时行情
export async function GET() {
  const data = await fetchIndices();
  return NextResponse.json({ data });
}
