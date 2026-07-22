import { NextResponse } from "next/server";
import { buildAmvBoard } from "@/lib/eastmoney";

// /api/amv：活跃市值 0AMV 板块数据（量价合成指数 + 研判 + 涨跌家数）
// 分钟级数据走短缓存；上游整体失败返回 503（客户端保留上一帧、下一轮自愈）
export const revalidate = 15;
// 备源链最坏情况（东财双 host 超时 → 腾讯 → 新浪）单市可达 ~14s，需超过默认函数时限
export const maxDuration = 30;

export async function GET() {
  const data = await buildAmvBoard();
  if (!data) return NextResponse.json({ data: null }, { status: 503 });
  return NextResponse.json({ data });
}
