import { NextResponse } from "next/server";
import { fetchPopularFunds } from "@/lib/eastmoney";
import type { RankSort } from "@/lib/types";

const VALID: RankSort[] = ["rzdf", "1yzf", "3yzf", "1nzf", "jnzf"];

// 热门榜：/api/popular?sort=1nzf&limit=8
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  const raw = sp.get("sort") ?? "1nzf";
  const sort: RankSort = VALID.includes(raw as RankSort) ? (raw as RankSort) : "1nzf";
  const limit = Math.min(20, Math.max(1, Number(sp.get("limit")) || 8));
  const data = await fetchPopularFunds(limit, sort);
  return NextResponse.json({ data, sort });
}
