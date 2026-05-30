import { NextResponse } from "next/server";
import { getFunds } from "@/lib/mock-data";

// 基金数据接口。当前返回演示假数据；接入真实数据源时改写这里即可，
// 前端可改为从 /api/funds 拉取（目前页面直接在服务端调用 getFunds）。
export function GET() {
  return NextResponse.json({ data: getFunds(), updatedAt: new Date().toISOString() });
}
