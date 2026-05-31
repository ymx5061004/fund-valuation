// 天天基金（东方财富）公开接口的服务端数据层。
//
// ⚠️ 只能在服务端调用（API 路由 / 服务端组件）：这些接口有 CORS 限制、且返回 JSONP/JS，
//    浏览器直接 fetch 会被拦或无法解析。
// ⚠️ 这些是非官方、未公开文档的接口，可能随时变更或限流，正式商用建议改用持牌数据源。

import type {
  ConstituentStock,
  Fund,
  FundMeta,
  FundType,
  IndexDetail,
  IndexQuote,
  KlineCandle,
  NavPoint,
  QuoteMetrics,
  RankSort,
} from "./types";

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
    return arr
      .slice(-limit)
      .map((p) => ({ date: tsToDate(p.x), nav: Number(p.y.toFixed(4)) }))
      .filter((p) => Number.isFinite(p.nav) && p.nav > 0); // 剔除异常/缺失净值，避免下游除零
  } catch {
    return [];
  }
}

interface BuildOpts {
  /** true 时实时估值不走缓存（按代码即时取数用） */
  fresh?: boolean;
  name?: string;
  type?: string;
  manager?: string;
}

/** 按代码组装一只基金的完整数据（实时估值 + 历史净值 + 元信息）。
 *  缺 type/manager 时才回源搜索接口补全。 */
async function buildFund(code: string, opts: BuildOpts = {}): Promise<Fund | null> {
  const needMeta = !opts.type || !opts.manager;
  const [est, history, metas] = await Promise.all([
    fetchEstimate(code, opts.fresh ?? false),
    fetchHistory(code),
    needMeta ? searchFunds(code) : Promise.resolve([] as FundMeta[]),
  ]);
  if (history.length === 0) return null; // 没有历史净值无法画图，视为失败
  const meta = metas.find((m) => m.code === code) ?? metas[0];
  const lastNav = history[history.length - 1].nav; // 权威「最新净值」= 历史净值最新点（gz 的 dwjz 偶尔滞后一天）
  return {
    code,
    name: est?.name ?? opts.name ?? meta?.name ?? code,
    type: opts.type ?? meta?.type ?? "其他",
    manager: opts.manager ?? meta?.manager ?? "—",
    nav: lastNav,
    estimateNav: est?.estimateNav ?? lastNav, // 天天基金盘中估值(gsz)
    estimateChangePct: est?.estimateChangePct ?? 0, // 估值涨幅(gszzl，相对前一交易日收盘)
    navHistory: history,
  };
}

// 排行榜接口失败时的兜底代码（仍是真实基金，只是不依赖排行榜）
const RANK_FALLBACK: { code: string; name: string; type?: string; manager?: string }[] = TRACKED_FUNDS.map(
  (t) => ({ code: t.code, name: "", type: t.type, manager: t.manager }),
);

/** 从天天基金排行榜取 top N（仅 code + name）。 */
async function fetchRanking(limit: number, sort: RankSort): Promise<{ code: string; name: string }[]> {
  try {
    const url = `https://fund.eastmoney.com/data/rankhandler.aspx?op=ph&dt=kf&ft=all&rs=&gs=0&sc=${sort}&st=desc&pi=1&pn=${limit}&dx=1`;
    const res = await fetch(url, {
      headers: { ...HEADERS, Referer: "https://fund.eastmoney.com/data/fundranking.html" },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const text = await res.text();
    const m = text.match(/datas:\[([\s\S]*?)\]/);
    if (!m) return [];
    const rows = m[1].match(/"([^"]*)"/g) ?? [];
    return rows
      .map((s) => {
        const parts = s.replace(/"/g, "").split(",");
        return { code: parts[0], name: parts[1] ?? "" };
      })
      .filter((x) => /^\d{6}$/.test(x.code));
  } catch {
    return [];
  }
}

/** 去掉基金名结尾的份额类别字母（如 A/B/C/E），用于合并同一只基金的多份额。
 *  仅在结尾字母前是中文/数字/右括号时才剥离，避免误伤英文名结尾。 */
function baseFundName(name: string): string {
  const m = name.match(/^(.*[一-龥)）0-9])([A-Z])$/);
  return m ? m[1] : name;
}

/** 拉取热门榜基金的完整数据（默认按近1年涨幅）。
 *  按份额去重（同一只基金的 A/C 只保留排名更高的一个），排行榜失败时回退到内置代码。 */
export async function fetchPopularFunds(limit = 8, sort: RankSort = "1nzf"): Promise<Fund[]> {
  // 多取一些，去重后再截断到 limit
  const ranked = await fetchRanking(Math.min(limit * 4, 50), sort);
  const source: { code: string; name: string; type?: string; manager?: string }[] =
    ranked.length > 0 ? ranked : RANK_FALLBACK;

  const seen = new Set<string>();
  const picked: typeof source = [];
  for (const e of source) {
    const key = baseFundName(e.name) || e.code; // 名称为空时退化为按代码
    if (seen.has(key)) continue;
    seen.add(key);
    picked.push(e);
    if (picked.length >= limit) break;
  }

  const funds = await Promise.all(
    picked.map((e) => buildFund(e.code, { name: e.name, type: e.type, manager: e.manager })),
  );
  return funds.filter((f): f is Fund => f !== null);
}

// ---- 基金搜索 + 按代码取数（支持任意基金） ----

interface SearchItem {
  CODE: string;
  NAME: string;
  CATEGORY: number;
  FundBaseInfo?: { FTYPE?: string; JJJL?: string; JJGS?: string };
}

/** 搜索基金（按代码或名称），返回简化的元信息列表。 */
export async function searchFunds(key: string, fresh = false): Promise<FundMeta[]> {
  try {
    const url = `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(key)}`;
    const res = fresh
      ? await fetch(url, { headers: HEADERS, cache: "no-store" })
      : await fetch(url, { headers: HEADERS, next: { revalidate: 3600 } });
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

/** 按代码取单只基金的完整数据（搜索添加用，取实时估值）。 */
export async function fetchFundFull(code: string): Promise<Fund | null> {
  return buildFund(code, { fresh: true });
}

// ---- 自选列表多指标（当日/本周/本月/今年/近一年） ----

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
/** history 升序：返回最后一个 date < target 的净值 */
function navBefore(history: NavPoint[], target: string): number | null {
  let res: number | null = null;
  for (const p of history) {
    if (p.date < target) res = p.nav;
    else break;
  }
  return res;
}
/** history 升序：返回最后一个 date <= target 的净值 */
function navOnOrBefore(history: NavPoint[], target: string): number | null {
  let res: number | null = null;
  for (const p of history) {
    if (p.date <= target) res = p.nav;
    else break;
  }
  return res;
}
function changePct(latest: number, base: number | null): number | null {
  if (base == null || base <= 0) return null;
  return Number((((latest - base) / base) * 100).toFixed(2));
}

// ---- 大盘指数实时行情（东方财富）----

// secid: 1=沪市 0=深市 100=全球。顺序即展示顺序：
// 上证/深证/创业板/沪深300/上证50/中证500/科创50/北证50/恒生/恒生科技/日经225/道琼斯/纳斯达克/标普500
const INDEX_SECIDS =
  "1.000001,0.399001,0.399006,1.000300,1.000016,1.000905,1.000688,0.899050,100.HSI,100.HSTECH,100.N225,100.DJIA,100.NDX,100.SPX";

interface IndexDiff {
  f2: number; // 当前点位
  f3: number; // 涨跌幅 %
  f4: number; // 涨跌点数
  f12: string; // 代码
  f13: number; // 市场(1沪 0深 100全球)
  f14: string; // 名称
  f5?: number; // 成交量(手)
  f6?: number; // 成交额(元)
  f15?: number; // 最高
  f16?: number; // 最低
  f17?: number; // 开盘
  f18?: number; // 昨收
}

async function fetchIndicesFrom(host: string): Promise<IndexQuote[] | null> {
  try {
    const url = `https://${host}/api/qt/ulist.np/get?fltt=2&secids=${INDEX_SECIDS}&fields=f2,f3,f4,f12,f13,f14`;
    const res = await fetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, cache: "no-store" });
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { diff?: IndexDiff[] } };
    const diff = json.data?.diff;
    if (!diff || diff.length === 0) return null;
    return diff
      .filter((d) => typeof d.f2 === "number")
      .map((d) => ({ secid: `${d.f13}.${d.f12}`, code: d.f12, name: d.f14, price: d.f2, change: d.f4, changePct: d.f3 }));
  } catch {
    return null;
  }
}

/** 拉取大盘指数行情：实时主机 push2 优先，失败回退延迟主机 push2delay。 */
export async function fetchIndices(): Promise<IndexQuote[]> {
  return (await fetchIndicesFrom("push2.eastmoney.com")) ?? (await fetchIndicesFrom("push2delay.eastmoney.com")) ?? [];
}

// ---- 指数详情（行情 + 分时） ----

async function fetchIndexQuoteFrom(host: string, secid: string): Promise<Omit<IndexDetail, "trend"> | null> {
  try {
    const url = `https://${host}/api/qt/ulist.np/get?fltt=2&secids=${encodeURIComponent(secid)}&fields=f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18`;
    const res = await fetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, cache: "no-store" });
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { diff?: IndexDiff[] } };
    const d = json.data?.diff?.[0];
    if (!d || typeof d.f2 !== "number") return null;
    return {
      secid: `${d.f13}.${d.f12}`,
      code: d.f12,
      name: d.f14,
      price: d.f2,
      change: d.f4,
      changePct: d.f3,
      high: d.f15 ?? 0,
      low: d.f16 ?? 0,
      open: d.f17 ?? 0,
      prevClose: d.f18 ?? 0,
      volume: d.f5 ?? 0,
      amount: d.f6 ?? 0,
    };
  } catch {
    return null;
  }
}

async function fetchTrendFrom(host: string, secid: string, ndays: number): Promise<{ time: string; price: number }[] | null> {
  try {
    const url = `https://${host}/api/qt/stock/trends2/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2&fields2=f51,f53&iscr=0&ndays=${ndays}`;
    const res = await fetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 20 } });
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { trends?: string[] } };
    const trends = json.data?.trends;
    if (!trends) return null;
    return trends
      .map((t) => {
        const parts = t.split(",");
        const dt = parts[0] ?? "";
        return { time: ndays > 1 ? dt.slice(5, 16) : dt.slice(11, 16), price: Number(parts[1]) };
      })
      .filter((p) => p.time && Number.isFinite(p.price));
  } catch {
    return null;
  }
}

/** 分时数据：ndays=1 当日，ndays=5 五日。push2his 优先回退 push2。 */
export async function fetchTrend(secid: string, ndays = 1): Promise<{ time: string; price: number }[]> {
  return (
    (await fetchTrendFrom("push2his.eastmoney.com", secid, ndays)) ??
    (await fetchTrendFrom("push2.eastmoney.com", secid, ndays)) ??
    []
  );
}

/** 取单个指数的详情（行情 + 当日分时）。 */
export async function fetchIndexDetail(secid: string): Promise<IndexDetail | null> {
  const quote =
    (await fetchIndexQuoteFrom("push2.eastmoney.com", secid)) ??
    (await fetchIndexQuoteFrom("push2delay.eastmoney.com", secid));
  if (!quote) return null;
  const trend = await fetchTrend(secid, 1);
  return { ...quote, trend };
}

// ---- K 线（日/周/月）----

async function fetchKlineFrom(host: string, secid: string, klt: number, lmt: number): Promise<KlineCandle[] | null> {
  try {
    // fields2: f51 日期 f52 开 f53 收 f54 高 f55 低
    const url = `https://${host}/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&klt=${klt}&fqt=0&beg=0&end=20500101&lmt=${lmt}&fields1=f1&fields2=f51,f52,f53,f54,f55`;
    const res = await fetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 300 } });
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { klines?: string[] } };
    const klines = json.data?.klines;
    if (!klines) return null;
    return klines.map((k) => {
      const p = k.split(",");
      return { date: p[0], open: Number(p[1]), close: Number(p[2]), high: Number(p[3]), low: Number(p[4]) };
    });
  } catch {
    return null;
  }
}

/** K 线：klt 101日/102周/103月。 */
export async function fetchKline(secid: string, klt: number, lmt = 120): Promise<KlineCandle[]> {
  return (
    (await fetchKlineFrom("push2his.eastmoney.com", secid, klt, lmt)) ??
    (await fetchKlineFrom("push2.eastmoney.com", secid, klt, lmt)) ??
    []
  );
}

// ---- 指数成分股（按市场涨跌幅榜，覆盖主要 A 股指数）----

// secid → clist 市场过滤（仅这些指数的成分≈整段市场，可直接用涨跌幅榜）
const INDEX_CONSTITUENT_FS: Record<string, string> = {
  "1.000001": "m:1+t:2,m:1+t:23", // 上证指数 → 沪市A股
  "0.399001": "m:0+t:6,m:0+t:80", // 深证成指 → 深市A股
  "0.399006": "m:0+t:80", // 创业板指 → 创业板
  "1.000688": "m:1+t:23", // 科创50 → 科创板
  "0.899050": "m:0+t:81+s:2048", // 北证50 → 北交所
};

export function hasConstituents(secid: string): boolean {
  return secid in INDEX_CONSTITUENT_FS;
}

interface ClistDiff {
  f2: number;
  f3: number;
  f12: string;
  f14: string;
  f21: number;
}

async function fetchConstituentsFrom(
  host: string,
  fs: string,
  pn: number,
  pz: number,
): Promise<{ stocks: ConstituentStock[]; total: number } | null> {
  try {
    const url = `https://${host}/api/qt/clist/get?pn=${pn}&pz=${pz}&po=1&fid=f3&fs=${encodeURIComponent(fs)}&fields=f2,f3,f12,f14,f21`;
    const res = await fetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, cache: "no-store" });
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { total?: number; diff?: Record<string, ClistDiff> } };
    const diff = json.data?.diff;
    if (!diff) return null;
    const stocks = Object.values(diff).map((d) => ({
      code: d.f12,
      name: d.f14,
      price: Number(d.f2) / 100, // 未用 fltt，价格/涨跌幅为放大100倍
      changePct: Number(d.f3) / 100,
      floatCap: Number(d.f21) || 0,
    }));
    return { stocks, total: json.data?.total ?? stocks.length };
  } catch {
    return null;
  }
}

/** 指数成分股（按涨跌幅排序，分页）。不支持的指数返回 null。 */
export async function fetchConstituents(secid: string, pn = 1, pz = 10): Promise<{ stocks: ConstituentStock[]; total: number } | null> {
  const fs = INDEX_CONSTITUENT_FS[secid];
  if (!fs) return null;
  return (
    (await fetchConstituentsFrom("push2.eastmoney.com", fs, pn, pz)) ??
    (await fetchConstituentsFrom("push2delay.eastmoney.com", fs, pn, pz))
  );
}

/** 北京时间「今天」的日期字符串 YYYY-MM-DD */
function todayBeijing(): string {
  const now = new Date();
  const bj = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + 8 * 3600000);
  return `${bj.getUTCFullYear()}-${pad2(bj.getUTCMonth() + 1)}-${pad2(bj.getUTCDate())}`;
}

/** 取单只基金的多区间涨幅（用历史净值计算，区间相对最新净值日期）。 */
export async function fetchQuoteMetrics(code: string): Promise<QuoteMetrics | null> {
  const [est, history] = await Promise.all([fetchEstimate(code, true), fetchHistory(code, 400)]);
  if (history.length === 0) return null;
  const last = history[history.length - 1];
  const latestNav = last.nav;

  const yStr = last.date.slice(0, 4);
  const mStr = last.date.slice(5, 7);
  const Y = Number(yStr);
  const M = Number(mStr);
  const D = Number(last.date.slice(8, 10));

  // 本周一（以最新净值日期所在周计）
  const dt = new Date(Y, M - 1, D);
  const dow = (dt.getDay() + 6) % 7; // 0=周一
  dt.setDate(dt.getDate() - dow);
  const mondayStr = `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;

  // 当日涨幅：若估值对应的交易日尚未公布净值(盘中) → 用估值涨幅；否则用官方确认涨幅(最近两个净值)
  const prevNav = history.length >= 2 ? history[history.length - 2].nav : null;
  const confirmedChange = changePct(latestNav, prevNav);
  const gzDate = est?.gztime?.slice(0, 10) ?? "";
  // 盘中估值 = 天天基金原始盘中估值（估值净值 gsz + 估值涨幅 gszzl，相对前一交易日收盘算；是预估值，可能与实际净值有偏差）
  const estimateNav = est?.estimateNav ?? latestNav;
  const estimateChangePct = est?.estimateChangePct ?? 0;
  // 当日涨幅：估值日=今天且未结算(净值未公布) → 用实时估值涨幅并标「估」；否则用官方确认涨幅
  const estimated = !!est && gzDate > last.date && gzDate === todayBeijing();
  const dayChangePct = estimated ? estimateChangePct : confirmedChange ?? estimateChangePct;
  const dayNav = estimated ? estimateNav : latestNav;

  return {
    code,
    name: est?.name ?? code,
    nav: latestNav,
    navDate: last.date,
    estimateNav,
    estimateChangePct,
    estimateFresh: !!est,
    dayChangePct,
    dayNav,
    dayEstimated: estimated,
    weekPct: changePct(latestNav, navBefore(history, mondayStr)),
    monthPct: changePct(latestNav, navBefore(history, `${yStr}-${mStr}-01`)),
    ytdPct: changePct(latestNav, navBefore(history, `${yStr}-01-01`)),
    yearPct: changePct(latestNav, navOnOrBefore(history, `${Y - 1}-${mStr}-${pad2(D)}`)),
  };
}
