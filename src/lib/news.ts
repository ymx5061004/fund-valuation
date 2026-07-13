// 东方财富资讯接口的服务端数据层（同 eastmoney.ts：仅服务端可调，非官方接口可能变更/限流）。

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  Referer: "https://www.eastmoney.com/",
};

/** 要闻条目 */
export interface NewsItem {
  code: string;
  title: string;
  summary: string;
  /** 展示时间，如 2026-07-13 15:02 */
  time: string;
  media: string;
  url: string;
}

/** 7×24 快讯条目 */
export interface FastNewsItem {
  code: string;
  title: string;
  summary: string;
  time: string;
  /** 接口标红的重要快讯 */
  important: boolean;
  url: string;
}

interface ColumnNewsRaw {
  code?: string;
  title?: string;
  summary?: string;
  showTime?: string;
  mediaName?: string;
  uniqueUrl?: string;
}

/** 财经要闻列表（column=350）。分页，每页 20 条。 */
export async function fetchNewsList(page = 1): Promise<NewsItem[]> {
  try {
    const url =
      `https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col&column=350&order=1&needInteractData=0` +
      `&page_index=${page}&page_size=20&req_trace=${Date.now()}&fields=code,showTime,title,mediaName,summary,uniqueUrl`;
    const res = await fetch(url, { headers: HEADERS, next: { revalidate: 120 } });
    if (!res.ok) return [];
    const json = JSON.parse(await res.text()) as { data?: { list?: ColumnNewsRaw[] } };
    return (json.data?.list ?? [])
      .filter((n) => n.title && n.code)
      .map((n) => ({
        code: n.code!,
        title: n.title!,
        summary: n.summary ?? "",
        time: (n.showTime ?? "").slice(0, 16),
        media: n.mediaName ?? "",
        // 接口返回 http，统一改 https 避免混合内容
        url: (n.uniqueUrl ?? `https://finance.eastmoney.com/a/${n.code}.html`).replace(/^http:/, "https:"),
      }));
  } catch {
    return [];
  }
}

interface FastNewsRaw {
  code?: string;
  title?: string;
  summary?: string;
  showTime?: string;
  titleColor?: number;
}

/** 7×24 全球财经快讯（fastColumn=102 全部）。sortEnd 用于翻页（传上一页返回值）。 */
export async function fetchFastNews(sortEnd = ""): Promise<{ items: FastNewsItem[]; sortEnd: string }> {
  try {
    const url =
      `https://np-weblist.eastmoney.com/comm/web/getFastNewsList?client=web&biz=web_724&fastColumn=102` +
      `&sortEnd=${encodeURIComponent(sortEnd)}&pageSize=50&req_trace=${Date.now()}`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return { items: [], sortEnd: "" };
    const json = JSON.parse(await res.text()) as {
      data?: { sortEnd?: string; fastNewsList?: FastNewsRaw[] };
    };
    const items = (json.data?.fastNewsList ?? [])
      .filter((n) => n.code && (n.title || n.summary))
      .map((n) => ({
        code: n.code!,
        title: n.title ?? "",
        // 快讯 summary 常以【标题】开头，去重展示
        summary: (n.summary ?? "").replace(/^【[^】]*】/, ""),
        time: (n.showTime ?? "").slice(0, 16),
        important: (n.titleColor ?? 0) > 0,
        url: `https://finance.eastmoney.com/a/${n.code}.html`,
      }));
    return { items, sortEnd: json.data?.sortEnd ?? "" };
  } catch {
    return { items: [], sortEnd: "" };
  }
}
