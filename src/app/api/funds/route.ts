import { NextResponse } from "next/server";
import { getDashboardFunds } from "@/lib/data";

// 全量基金数据接口：真实数据优先，失败回退演示数据。
export async function GET() {
  const { funds, source } = await getDashboardFunds();
  return NextResponse.json({ source, data: funds, updatedAt: new Date().toISOString() });
}
