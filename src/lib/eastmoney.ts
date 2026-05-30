// 天天基金（东方财富）公开接口的服务端数据层。
//
// ⚠️ 只能在服务端调用（API 路由 / 服务端组件）：这些接口有 CORS 限制、且返回 JSONP/JS，
//    浏览器直接 fetch 会被拦或无法解析。
// ⚠️ 这些是非官方、未公开文档的接口，可能随时变更或限流，正式商用建议改用持牌数据源。

import type { Fund, FundMeta, FundType, NavPoint } from "./types";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  Referer: "https://fund.eastmoney.com/",
};

/** 跟踪的基金（真实代码）。type / manager 在此维护，名称与净值/估值来自接口。 */
export interface TrackedFund {
  code: string;
  type: FundType;
  manager: string;
}

export const TRACKED_FUNDS: TrackedFund[] = [
  { code: "161725", type: "指数型", manager: "侯昊" },
  { code: "005827", type: "混合型", manager: "张坤" },
  { code: "003096", type: "混合型", manager: "葛兰" },
  { code: "161005", type: "混合型", manager: "朱少醒" },
  { code: "110011", type: "QDII", manager: "陈皓" },
  { code: "001632", type: "指数型", manager: "刘冬燕" },
  { code: "270042", type: "QDII", manager: "刘杰" },
  { code: "519674", type: "混合型", manager: "郑巍山" },
];

export interface Estimate {
  code: string;
  name: string;
  /** 上一交易日单位净值 */
  nav: number;
  /** 盘中估值 */
  estimateNav: number;
  /** 估值涨跌幅 % */
  estimateChangePct: number;
  /** 估值时间 */
  gztime: string;
}

interface GzPayload {
  fundcode: string;
  name: string;
  jzrq: string;
  dwjz: string;
  gsz: string;
  gszzl: string;
  gztime: string;
}

/** 拉取实时估值。fresh=true 时不走缓存（供客户端轮询的接口使用）。 */
export async function fetchEstimate(code: string, fresh = false): Promise<Estimate | null> {
  try {
    const url = `https://fundgz.1234567.com.cn/js/${code}.js?rt=${Date.now()}`;
    const res = fresh
      ? await fetch(url, { headers: HEADERS, cache: "no-store" })
      : await fetch(url, { headers: HEADERS, next: { revalidate: 30 } });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/jsonpgz\(([\s\S]*)\)/);
    if (!m) return null;
    const gz = JSON.parse(m[1]) as GzPayload;
    const nav = Number(gz.dwjz);
    return {
      code,
      name: gz.name,
      nav,
      estimateNav: Number(gz.gsz) || nav,
      estimateChangePct: Number(gz.gszzl) || 0,
      gztime: gz.gztime,
    };
  } catch {
    return null;
  }
}

/** 毫秒时间戳 → 北京时间 YYYY-MM-DD */
function tsToDate(ms: number): string {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 拉取历史净值（取最近 limit 个交易日）。历史数据每小时最多回源一次。 */
export async function fetchHistory(code: string, limit = 250): Promise<NavPoint[]> {
  try {
    const res = await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js`, {
      headers: HEADERS,
      next: { revalidate: 3600 },
    });
    if (!res.ok) return [];
    const text = await res.text();
    const m = text.match(/Data_netWorthTrend\s*=\s*(\[[^\]]*\])/);
    if (!m) return [];
    const arr = JSON.parse(m[1]) as { x: number; y: number }[];
    return arr.slice(-limit).map((p) => ({ date: tsToDate(p.x), nav: Number(p.y.toFixed(4)) }));
  } catch {
    return [];
  }
}

async function fetchFund(t: TrackedFund): Promise<Fund | null> {
  const [est, history] = await Promise.all([fetchEstimate(t.code), fetchHistory(t.code)]);
  if (history.length === 0) return null; // 没有历史净值就无法画图，视为失败
  const lastNav = history[history.length - 1].nav;
  return {
    code: t.code,
    name: est?.name ?? t.code,
    type: t.type,
    manager: t.manager,
    nav: est?.nav ?? lastNav,
    estimateNav: est?.estimateNav ?? lastNav,
    estimateChangePct: est?.estimateChangePct ?? 0,
    navHistory: history,
  };
}

/** 拉取全部跟踪基金的真实数据（失败的基金会被过滤掉）。 */
export async function fetchAllFunds(): Promise<Fund[]> {
  const results = await Promise.all(TRACKED_FUNDS.map((t) => fetchFund(t)));
  return results.filter((f): f is Fund => f !== null);
}

// ---- 基金搜索 + 按代码取数（支持任意基金） ----

interface SearchItem {
  CODE: string;
  NAME: string;
  CATEGORY: number;
  FundBaseInfo?: { FTYPE?: string; JJJL?: string; JJGS?: string };
}

/** 搜索基金（按代码或名称），返回简化的元信息列表。 */
export async function searchFunds(key: string): Promise<FundMeta[]> {
  try {
    const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(key)}`;
    const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
    if (!res.ok) return [];
    const json = JSON.parse(await res.text()) as { Datas?: SearchItem[] };
    return (json.Datas ?? [])
      .filter((d) => d.CATEGORY === 700 && d.FundBaseInfo) // 只保留基金
      .slice(0, 12)
      .map((d) => ({
        code: d.CODE,
        name: d.NAME,
        type: (d.FundBaseInfo?.FTYPE ?? "").split("-")[0] || "其他",
        manager: d.FundBaseInfo?.JJJL || "—",
        company: d.FundBaseInfo?.JJGS ?? "",
      }));
  } catch {
    return [];
  }
}

/** 按代码取单只基金的完整数据（实时估值 + 历史净值 + 元信息）。 */
export async function fetchFundFull(code: string): Promise<Fund | null> {
  const [est, history, metas] = await Promise.all([
    fetchEstimate(code, true),
    fetchHistory(code),
    searchFunds(code),
  ]);
  if (history.length === 0) return null;
  const meta = metas.find((m) => m.code === code) ?? metas[0];
  const lastNav = history[history.length - 1].nav;
  return {
    code,
    name: est?.name ?? meta?.name ?? code,
    type: meta?.type ?? "其他",
    manager: meta?.manager ?? "—",
    nav: est?.nav ?? lastNav,
    estimateNav: est?.estimateNav ?? lastNav,
    estimateChangePct: est?.estimateChangePct ?? 0,
    navHistory: history,
  };
}
