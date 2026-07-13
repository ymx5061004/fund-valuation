import { NextResponse } from "next/server";
import { fetchFastNews, fetchNewsList } from "@/lib/news";

// 资讯：/api/news?tab=list&page=1（要闻分页） | /api/news?tab=fast&sortEnd=xxx（7×24 快讯翻页）
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const tab = params.get("tab") ?? "list";

  if (tab === "fast") {
    const { items, sortEnd } = await fetchFastNews(params.get("sortEnd") ?? "");
    return NextResponse.json({ data: items, sortEnd });
  }

  const page = Math.min(Math.max(Number(params.get("page")) || 1, 1), 50);
  const items = await fetchNewsList(page);
  return NextResponse.json({ data: items, page });
}
