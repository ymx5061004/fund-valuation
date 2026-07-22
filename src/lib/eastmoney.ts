// 天天基金（东方财富）公开接口的服务端数据层。
//
// ⚠️ 只能在服务端调用（API 路由 / 服务端组件）：这些接口有 CORS 限制、且返回 JSONP/JS，
//    浏览器直接 fetch 会被拦或无法解析。
// ⚠️ 这些是非官方、未公开文档的接口，可能随时变更或限流，正式商用建议改用持牌数据源。

import type {
  AmvBoard,
  ConstituentStock,
  Fund,
  FundMeta,
  FundType,
  IndexDetail,
  IndexQuote,
  KlineCandle,
  MarketBreadth,
  NavPoint,
  QuoteMetrics,
  RankSort,
} from "./types";
import { fetchSinaEstimates, fetchSinaKline, fetchTencentIndices, fetchTencentKline } from "./backup-sources";
import { AMV_BOARD_HISTORY, amvChange, analyzeAmv, computeAmvIndex, dropUnfinishedToday, isAShareTradingNow } from "./amv";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  Referer: "https://fund.eastmoney.com/",
};

/** 基金代码/指数 secid 校验：所有拼进上游 URL 的入参先过这里，防止路径注入与无效请求 */
const FUND_CODE_RE = /^\d{6}$/;
export const SECID_RE = /^\d{1,3}\.[A-Za-z0-9]{1,10}$/;

/** 统一的上游抓取：所有 fetch 必须带超时（上游 TCP 挂起时 try/catch 抓不到，会拖死轮询接口）。
 *  有备用主机的调用传 ~3000ms 便于及时回退，其余默认 5000ms。 */
function emFetch(url: string, init: RequestInit & { next?: { revalidate: number } }, timeoutMs = 5000) {
  return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** 并发池：分批执行，防止单个请求对上游瞬时发出上百个连接（招致限流）。 */
export async function mapWithLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += limit) {
    const batch = items.slice(i, i + limit);
    results.push(...(await Promise.all(batch.map(fn))));
  }
  return results;
}

/** 接口偶发返回 "-"（停牌/未开盘）等非数值，统一转 0 防 NaN 渗透 */
function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 解析 ?codes= 参数：去重 + 过滤非法代码 + 截断（顺序不能反：先截断会让非法项挤占配额） */
export function parseCodes(raw: string | null, max = 50): string[] {
  return Array.from(new Set((raw ?? "").split(",").map((c) => c.trim())))
    .filter((c) => FUND_CODE_RE.test(c))
    .slice(0, max);
}

// ---- 进程级韧性设施：同 key 请求去重 + 最近成功值兜底 ----
// serverless 温实例的模块级内存跨请求保留，足以扛住几分钟的上游限流窗口；冷启动丢失可接受。

const inflight = new Map<string, Promise<unknown>>();
/** 同一时刻对同一 key 的并发调用只发一次上游，共享同一个 Promise（防多用户/多页轮询放大）。 */
function dedup<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cur = inflight.get(key);
  if (cur) return cur as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

const lastGood = new Map<string, { value: unknown; at: number }>();
/** 容量上限：hist 条目最大（400 点净值数十 KB），800 条封顶约几十 MB，
 *  远超正常用户的自选+持有规模——只防公开接口被批量扫码时温实例内存无界增长 */
const LAST_GOOD_MAX = 800;
/** 记录最近一次成功结果（stale-while-error 兜底用）。重插保持插入序≈LRU，超限淘汰最旧。 */
function remember<T>(key: string, value: T): T {
  lastGood.delete(key);
  lastGood.set(key, { value, at: Date.now() });
  while (lastGood.size > LAST_GOOD_MAX) lastGood.delete(lastGood.keys().next().value!);
  return value;
}
/** 取 maxAgeMs 内的最近成功结果；没有或过期返回 null。
 *  只读不删：同一 key 会被不同 maxAge 查询（如估值的 90s 快查与 10min 兜底）。 */
function recall<T>(key: string, maxAgeMs: number): T | null {
  const hit = lastGood.get(key);
  if (!hit || Date.now() - hit.at > maxAgeMs) return null;
  return hit.value as T;
}

/** 实时类数据（估值/指数）允许回退到 10 分钟内的旧值；历史净值一天才变一次，放宽到 24h */
const STALE_LIVE_MS = 10 * 60_000;
const STALE_HISTORY_MS = 24 * 3600_000;

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

/** 拉取实时估值（仅天天基金主源；带备源回退用 fetchEstimatesBatch）。
 *  估值上游分钟级更新，no-store 没有意义：fresh=true 走 15s 短缓存（轮询用）、否则 30s——
 *  多用户/多标签的轮询在服务端（共享 Data Cache）合并成一份上游流量，这是抗限流的第一道闸。
 *  注：Next 数据缓存是 stale-while-revalidate——过期后首个请求仍返回旧值并触发后台刷新，
 *  稳态下数据新鲜度上界约 2×revalidate（fresh 档约 30s），对分钟级更新的估值可接受。 */
export async function fetchEstimate(code: string, fresh = false): Promise<Estimate | null> {
  if (!FUND_CODE_RE.test(code)) return null;
  return dedup(`gz:${code}:${fresh}`, async () => {
    try {
      // URL 必须稳定（不带 rt 时间戳），Next 数据缓存以完整 URL 为 key
      const res = await emFetch(`https://fundgz.1234567.com.cn/js/${code}.js`, {
        headers: HEADERS,
        next: { revalidate: fresh ? 15 : 30 },
      });
      if (!res.ok) return null;
      const text = await res.text();
      const m = text.match(/jsonpgz\(([\s\S]*)\)/);
      if (!m) return null;
      if (!m[1].trim()) {
        // 主源健康但确认无估值数据（货币基金/部分 QDII 返回 jsonpgz();）——
        // 负缓存 30 分钟，免得 fetchEstimatesBatch 对这类基金常态性打新浪备源
        remember(`noest:${code}`, true);
        return null;
      }
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
  });
}

/** 批量实时估值（带备源回退 + 旧值兜底）。回退顺序（每一级只处理上一级仍缺的代码）：
 *  1) 天天基金逐只（并发池）——主源，估值口径以它为准，成功值记入 est:{code}；
 *  2) 90 秒内的主源旧值——主源间歇性限流时优先沿用自家口径。⚠️ 新浪与天天基金是
 *     不同的估算模型（实测同一时刻可差 0.6+ 个百分点），主源抖动时若直接顶替会导致
 *     估值/当日收益每轮轮询来回跳变，所以近期主源旧值排在新浪前面；
 *  3) 新浪 fu_ 一次批量（基准语义等价：估值涨幅同样相对昨日净值 dwjz）。
 *     新浪值记入独立的 est-sina:{code}，不污染主源旧值层；已负缓存「确认无估值」的代码跳过；
 *  4) 10 分钟内的主源旧值 → 10 分钟内的新浪旧值。
 *  注意：主源对「本就没有估值数据」的基金（货币/部分 QDII）返回 null 并做负缓存，
 *  这类代码各级都不会命中，行为与之前一致（前端按无估值处理）。 */
export async function fetchEstimatesBatch(codes: string[]): Promise<Estimate[]> {
  const valid = codes.filter((c) => FUND_CODE_RE.test(c));
  if (valid.length === 0) return [];

  const primary = await mapWithLimit(valid, 8, (c) => fetchEstimate(c, true));
  const got = new Map<string, Estimate>();
  for (const e of primary) {
    if (e) got.set(e.code, remember(`est:${e.code}`, e));
  }

  // 2) 近期主源旧值
  let missing = valid.filter((c) => !got.has(c));
  for (const c of missing) {
    const recent = recall<Estimate>(`est:${c}`, 90_000);
    if (recent) got.set(c, recent);
  }

  // 3) 新浪批量兜底（跳过确认无估值的代码）
  missing = valid.filter((c) => !got.has(c) && !recall<boolean>(`noest:${c}`, 30 * 60_000));
  if (missing.length > 0) {
    for (const e of await fetchSinaEstimates(missing)) {
      if (!got.has(e.code)) got.set(e.code, remember(`est-sina:${e.code}`, e));
    }
  }

  // 4) 旧值兜底：主源优先于新浪
  for (const c of valid) {
    if (got.has(c)) continue;
    const stale =
      recall<Estimate>(`est:${c}`, STALE_LIVE_MS) ?? recall<Estimate>(`est-sina:${c}`, STALE_LIVE_MS);
    if (stale) got.set(c, stale);
  }
  return valid.map((c) => got.get(c)).filter((e): e is Estimate => !!e);
}

/** 毫秒时间戳 → 北京时间 YYYY-MM-DD */
function tsToDate(ms: number): string {
  return new Date(ms + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 是否处于当日净值集中公布时段（北京时间 19:00~24:00）——该窗口缩短历史缓存让新净值尽快可见 */
function isNavPublishWindow(): boolean {
  return new Date(Date.now() + 8 * 3600000).getUTCHours() >= 19;
}

/** 拉取历史净值（取最近 limit 个交易日）。
 *  常规每小时回源一次；净值公布时段（晚 19~24 点）缩短到 5 分钟；
 *  上游失败/解析为空时回退 24h 内的最近成功值（历史一天才变一次）。 */
export async function fetchHistory(code: string, limit = 250): Promise<NavPoint[]> {
  if (!FUND_CODE_RE.test(code)) return [];
  const cacheKey = `hist:${code}:${limit}`;
  return dedup(cacheKey, async () => {
    let points: NavPoint[] = [];
    try {
      const res = await emFetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js`, {
        headers: HEADERS,
        next: { revalidate: isNavPublishWindow() ? 300 : 3600 },
      });
      if (res.ok) {
        const text = await res.text();
        const m = text.match(/Data_netWorthTrend\s*=\s*(\[[^\]]*\])/);
        if (m) {
          const arr = JSON.parse(m[1]) as { x: number; y: number | null }[];
          points = arr
            .slice(-limit)
            // 先 Number 再过滤：个别点 y 为 null，直接 p.y.toFixed 会抛异常导致整段历史丢失
            .map((p) => ({ date: tsToDate(p.x), nav: Number(p.y) }))
            .filter((p) => Number.isFinite(p.nav) && p.nav > 0) // 剔除异常/缺失净值，避免下游除零
            .map((p) => ({ date: p.date, nav: Number(p.nav.toFixed(4)) }));
        }
      }
    } catch {
      // 走下方旧值兜底
    }
    if (points.length > 0) return remember(cacheKey, points);
    return recall<NavPoint[]>(cacheKey, STALE_HISTORY_MS) ?? [];
  });
}

interface BuildOpts {
  /** true 走 15s 短缓存（轮询/按代码即时取数用），false 为 30s，见 fetchEstimate */
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
    // 用 || 而非 ??：排行榜兜底等来源的 name 可能是空字符串
    name: est?.name || opts.name || meta?.name || code,
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
    const res = await emFetch(url, {
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

  // 并发池：每只基金最多 3 个上游 fetch，直接 Promise.all 会瞬时打出 60+ 并发
  const funds = await mapWithLimit(picked, 6, (e) => buildFund(e.code, { name: e.name, type: e.type, manager: e.manager }));
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
      ? await emFetch(url, { headers: HEADERS, cache: "no-store" })
      : await emFetch(url, { headers: HEADERS, next: { revalidate: 3600 } });
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
    // revalidate:5 而非 no-store：多标签/多用户 15s 轮询时压低上游 QPS，5s 内新鲜度足够
    const res = await emFetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 5 } }, 3000);
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

/** 拉取大盘指数行情：东财 push2 → push2delay 为主源；
 *  个别指数缺失（东财偶发对某指数返回非数值，如收盘瞬间的港股）或全挂时用腾讯 qt 补齐/兜底（腾讯缺日经）；
 *  仍缺的逐指数回退 10 分钟内旧值。输出顺序恒为 INDEX_SECIDS 声明顺序。
 *  旧值按指数粒度记忆（idx:{secid}）且只在真实抓到时刷新时间戳——
 *  避免整表快照被残缺结果覆盖，也避免旧值被反复续期突破 10 分钟上界。 */
export async function fetchIndices(): Promise<IndexQuote[]> {
  return dedup("indices", async () => {
    const secids = INDEX_SECIDS.split(",");
    const em =
      (await fetchIndicesFrom("push2.eastmoney.com")) ?? (await fetchIndicesFrom("push2delay.eastmoney.com"));
    const bySecid = new Map<string, IndexQuote>();
    for (const q of em ?? []) bySecid.set(q.secid, q);

    const missing = secids.filter((s) => !bySecid.has(s));
    if (missing.length > 0) {
      for (const q of await fetchTencentIndices(missing)) bySecid.set(q.secid, q);
    }

    for (const q of bySecid.values()) remember(`idx:${q.secid}`, q);
    for (const s of secids) {
      if (bySecid.has(s)) continue;
      const stale = recall<IndexQuote>(`idx:${s}`, STALE_LIVE_MS);
      if (stale) bySecid.set(s, stale);
    }
    return secids.map((s) => bySecid.get(s)).filter((q): q is IndexQuote => !!q);
  });
}

// ---- 指数详情（行情 + 分时） ----

async function fetchIndexQuoteFrom(host: string, secid: string): Promise<Omit<IndexDetail, "trend"> | null> {
  try {
    const url = `https://${host}/api/qt/ulist.np/get?fltt=2&secids=${encodeURIComponent(secid)}&fields=f2,f3,f4,f5,f6,f12,f13,f14,f15,f16,f17,f18`;
    const res = await emFetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 5 } }, 3000);
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { diff?: IndexDiff[] } };
    const d = json.data?.diff?.[0];
    if (!d || typeof d.f2 !== "number") return null;
    return {
      secid: `${d.f13}.${d.f12}`,
      code: d.f12,
      name: d.f14,
      price: d.f2,
      change: num(d.f4),
      changePct: num(d.f3),
      // 集合竞价前/停牌时高开低昨等字段可能为 "-"，num 兜底防 NaN
      high: num(d.f15),
      low: num(d.f16),
      open: num(d.f17),
      prevClose: num(d.f18),
      volume: num(d.f5),
      amount: num(d.f6),
    };
  } catch {
    return null;
  }
}

async function fetchTrendFrom(host: string, secid: string, ndays: number): Promise<{ time: string; price: number }[] | null> {
  try {
    const url = `https://${host}/api/qt/stock/trends2/get?secid=${encodeURIComponent(secid)}&fields1=f1,f2&fields2=f51,f53&iscr=0&ndays=${ndays}`;
    const res = await emFetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 20 } }, 3000);
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

/** 取单个指数的详情（行情 + 当日分时）。双主机全挂时回退 10 分钟内旧值；
 *  行情成功但分时接口挂时沿用 10 分钟内的旧分时（避免图表闪空）。
 *  分时旧值单独记忆（trend:{secid}）且只在真实抓到时刷新时间戳——
 *  若把回收的旧分时随行情一起 remember，会被轮询反复续期、冻结的曲线永不过期。 */
export async function fetchIndexDetail(secid: string): Promise<IndexDetail | null> {
  const cacheKey = `idxd:${secid}`;
  return dedup(cacheKey, async () => {
    const quote =
      (await fetchIndexQuoteFrom("push2.eastmoney.com", secid)) ??
      (await fetchIndexQuoteFrom("push2delay.eastmoney.com", secid));
    if (!quote) return recall<IndexDetail>(cacheKey, STALE_LIVE_MS);
    let trend = await fetchTrend(secid, 1);
    if (trend.length > 0) remember(`trend:${secid}`, trend);
    else trend = recall<{ time: string; price: number }[]>(`trend:${secid}`, STALE_LIVE_MS) ?? [];
    return remember(cacheKey, { ...quote, trend });
  });
}

// ---- K 线（日/周/月）----

async function fetchKlineFrom(host: string, secid: string, klt: number, lmt: number, beg: number | string): Promise<KlineCandle[] | null> {
  try {
    // fields2: f51 日期 f52 开 f53 收 f54 高 f55 低 f56 成交量(手) f57 成交额（活跃市值 0AMV 计算用）
    const url = `https://${host}/api/qt/stock/kline/get?secid=${encodeURIComponent(secid)}&klt=${klt}&fqt=0&beg=${beg}&end=20500101&lmt=${lmt}&fields1=f1&fields2=f51,f52,f53,f54,f55,f56,f57`;
    const res = await emFetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 300 } }, 3000);
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { klines?: string[] } };
    const klines = json.data?.klines;
    if (!klines) return null;
    return klines.map((k) => {
      const p = k.split(",");
      const volume = Number(p[5]);
      const amount = Number(p[6]);
      return {
        date: p[0],
        open: Number(p[1]),
        close: Number(p[2]),
        high: Number(p[3]),
        low: Number(p[4]),
        // 个别指数无量额（返回 "-"）→ 不带该字段，amv 计算会整体跳过
        ...(Number.isFinite(volume) && volume > 0 ? { volume } : {}),
        ...(Number.isFinite(amount) && amount > 0 ? { amount } : {}),
      };
    });
  } catch {
    return null;
  }
}

/** K 线：klt 101日/102周/103月。两个 host 都失败时用进程内 24h 旧值兜底
 *  （日频数据、旧值可接受；防东财瞬时限流/网络抖动让 K 线图与活跃市值板块整片空白）。
 *  beg：起始日 YYYYMMDD。默认 0＝全量（K 线图沿用，~880KB）；**大体量场景务必传有界日期**——
 *  全量包在 3s 超时内经常传不完（实测线上深市 kline 因此从未成功过），有界区间只有几十 KB。 */
export async function fetchKline(secid: string, klt: number, lmt = 120, beg: number | string = 0): Promise<KlineCandle[]> {
  const cacheKey = `kline:${secid}:${klt}:${beg}`; // beg 参与 key：有界与全量是不同数据集，旧值兜底不能互相污染
  // 失败负缓存 90s：全源挂时短时间内不再打上游——防止「失败→无缓存→下个请求继续锤→持续被限流」
  // 的雪崩回路（客户端 30s/60s 轮询 + 多访客叠加时尤甚）；90s 后自动恢复尝试
  if (recall<boolean>(`kline-neg:${cacheKey}`, 90_000)) {
    return recall<KlineCandle[]>(cacheKey, STALE_HISTORY_MS) ?? [];
  }
  const candles =
    (await fetchKlineFrom("push2his.eastmoney.com", secid, klt, lmt, beg)) ??
    (await fetchKlineFrom("push2.eastmoney.com", secid, klt, lmt, beg));
  if (candles && candles.length > 0) return remember(cacheKey, candles);
  // 日 K 备源链（仅 A 股 + 日 K；均无成交额，额类指标由 UI 降级）——东财曾对数据中心 IP 段封 kline。
  // 腾讯优先：CDN 全球分发、Vercel 可达；新浪对海外数据中心 IP 实测超时，仅本机/国内环境兜得住
  if (klt === 101) {
    const backup = (await fetchTencentKline(secid)) ?? (await fetchSinaKline(secid));
    if (backup && backup.length > 0) return remember(cacheKey, backup);
  }
  remember(`kline-neg:${cacheKey}`, true);
  return recall<KlineCandle[]>(cacheKey, STALE_HISTORY_MS) ?? [];
}

// ---- 活跃市值 0AMV 板块（大盘活跃资金，公开成交额估算版；见 lib/amv.ts）----

/** 两市涨跌家数（活跃市值板块的市场宽度）。上游不支持/失败返回 null，UI 据此隐藏。 */
export async function fetchMarketBreadth(): Promise<MarketBreadth | null> {
  try {
    // ulist.np 一次取沪深两市指数的涨跌家数字段（f104 上涨 / f105 下跌 / f106 平盘），求和
    const url = `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001&fields=f104,f105,f106`;
    const res = await emFetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 15 } }, 3000);
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { diff?: { f104?: number; f105?: number; f106?: number }[] } };
    const diff = json.data?.diff;
    if (!diff?.length) return null;
    let up = 0,
      down = 0,
      flat = 0;
    for (const d of diff) {
      up += Number(d.f104) || 0;
      down += Number(d.f105) || 0;
      flat += Number(d.f106) || 0;
    }
    return up + down + flat > 0 ? { up, flat, down } : null;
  } catch {
    return null;
  }
}

/** 组装活跃市值板块数据：两市（沪指+深成指）成交额合计作活跃资金，沪指做参考指数与剔除口径。
 *  /api/amv 与 /market 入口卡（AmvStrip）共用，保证两处数值口径一致。上游不足返回 null。 */
export async function buildAmvBoard(): Promise<AmvBoard | null> {
  // 起始日＝北京今天 − 1250 自然日（≈850 交易日）：够 AMV_BOARD_HISTORY=750 + 滚动窗 10，
  // 且上游只回几十 KB——beg=0 全量 ~880KB 在 3s 超时内常传不完，深市 kline 在线上因此从未成功过
  // （实测 prod candle:[] 而沪市靠早先缓存存活），板块被迫长期 sh-only 甚至整体 503。
  const bj = new Date(Date.now() + 8 * 3600000 - 1250 * 86400000);
  const beg = `${bj.getUTCFullYear()}${pad2(bj.getUTCMonth() + 1)}${pad2(bj.getUTCDate())}`;
  // lmt 1200 > 可能返回的 ~850 根：无论上游把 lmt 当头部还是尾部截断都不会误删数据
  const [sh, sz, breadth] = await Promise.all([
    fetchKline("1.000001", 101, 1200, beg),
    fetchKline("0.399001", 101, 1200, beg),
    fetchMarketBreadth(),
  ]);
  // 板级旧值兜底（失败路径 24h：板块是日频数据，长时间封禁/限流期间温实例供昨日板远好于 503；
  // tradingNow/todayAmount 会随旧板停在缓存时刻，属可接受降级）
  // （同估值回退「主源旧值优先于备源」的既有哲学：近期完整两市值 优先于 新鲜的半市值）
  if (sh.length === 0) return recall<AmvBoard>("amv:board", STALE_HISTORY_MS); // 沪指都拿不到则整体失败→旧板兜底
  // 深市整体抓取失败（sz=[]）时退化为仅沪市：值会偏低，用 coverage 标注让 UI 诚实提示，不静默冒充「两市」
  const coverage: "both" | "sh-only" = sz.length > 0 ? "both" : "sh-only";
  const szByDate = new Map(sz.map((c) => [c.date, c]));
  // 合成候选：沪指 K 线（价格 OHLC 作指数基准）+ 两市成交量/额合计（深市缺该日则只计沪市）
  const combined: KlineCandle[] = sh.map((c) => {
    const s = szByDate.get(c.date);
    return { ...c, volume: (c.volume ?? 0) + (s?.volume ?? 0), amount: (c.amount ?? 0) + (s?.amount ?? 0) };
  });
  const dropped = dropUnfinishedToday(combined, "1.000001");
  // 今日实时两市成交额：仅当今日 K 线因未收盘被剔除时，取原始末根（今日累计成交额）
  const rawLast = combined[combined.length - 1];
  const todayAmount = dropped.length < combined.length && rawLast ? rawLast.amount ?? null : null;
  // 活跃筹码市值指数（真 OHLC 蜡烛）+ 研判序列
  const idx = computeAmvIndex(dropped);
  const candles = idx.candles.slice(-AMV_BOARD_HISTORY);
  const points = idx.points.slice(-AMV_BOARD_HISTORY);
  const analysis = analyzeAmv(points);
  const chg = amvChange(points);
  if (!analysis || !chg) return recall<AmvBoard>("amv:board", STALE_HISTORY_MS); // 样本不足同属失败路径→24h 旧板
  // 「活跃资金」金额口径副指标：近10日两市成交额合计
  const turnover10 = dropped.slice(-10).reduce((s, c) => s + (c.amount ?? 0), 0);
  const board: AmvBoard = {
    value: chg.value,
    change: chg.change,
    changePct: chg.changePct,
    date: chg.date,
    todayAmount,
    turnover10,
    coverage,
    tradingNow: isAShareTradingNow(),
    analysis,
    candles,
    breadth,
  };
  // 只记忆完整两市板；仅沪市的降级板优先让位给近期完整板（防值腰斩跳变），实在没有再如实降级展示
  if (coverage === "sh-only") return recall<AmvBoard>("amv:board", STALE_LIVE_MS) ?? board;
  return remember("amv:board", board);
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
    const res = await emFetch(url, { headers: { ...HEADERS, Referer: "https://quote.eastmoney.com/" }, next: { revalidate: 5 } }, 3000);
    if (!res.ok) return null;
    const json = JSON.parse(await res.text()) as { data?: { total?: number; diff?: Record<string, ClistDiff> } };
    const diff = json.data?.diff;
    if (!diff) return null;
    const stocks = Object.values(diff).map((d) => ({
      code: d.f12,
      name: d.f14,
      price: num(d.f2) / 100, // 未用 fltt，价格/涨跌幅为放大100倍；停牌/新股为 "-"，num 防 NaN
      changePct: num(d.f3) / 100,
      floatCap: num(d.f21),
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

/** 北京时间「今天」的日期字符串 YYYY-MM-DD。
 *  epoch+8h 后用 getUTC* 读即为北京墙钟，与服务器时区无关（不要再加 getTimezoneOffset，
 *  否则非 UTC 服务器上会错移，如北京时区机器 0-8 点会返回昨天）。 */
function todayBeijing(): string {
  const bj = new Date(Date.now() + 8 * 3600000);
  return `${bj.getUTCFullYear()}-${pad2(bj.getUTCMonth() + 1)}-${pad2(bj.getUTCDate())}`;
}

/** 取单只基金的多区间涨幅（用历史净值计算，区间相对最新净值日期）。
 *  presetEst：批量调用方（/api/quotes）先用 fetchEstimatesBatch 一次拿全所有估值再逐只传入——
 *  避免每只基金各自触发「批量为 1」的新浪兜底请求，把备源打成逐只轰炸。
 *  显式传 null 表示「已批量查过、确认无估值」，不要再内部重查。 */
export async function fetchQuoteMetrics(code: string, presetEst?: Estimate | null): Promise<QuoteMetrics | null> {
  if (!FUND_CODE_RE.test(code)) return null;
  const [est, history] = await Promise.all([
    presetEst !== undefined
      ? Promise.resolve(presetEst)
      : fetchEstimatesBatch([code]).then((r) => r[0] ?? null), // 单只调用时仍带新浪备源与旧值兜底
    fetchHistory(code, 400),
  ]);
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
  // 当日涨幅：估值日=今天且未结算(净值未公布) → 用实时估值涨幅并标「估」；否则用官方确认涨幅。
  // 只有 1 个净值点的新基金没有确认涨幅，只能退回估值口径，此时同样标「估」而非冒充确认值
  const estimated = !!est && gzDate > last.date && gzDate === todayBeijing();
  const useEstimate = estimated || confirmedChange == null;
  const dayChangePct = useEstimate ? estimateChangePct : confirmedChange;
  const dayNav = useEstimate ? estimateNav : latestNav;

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
    dayEstimated: useEstimate,
    weekPct: changePct(latestNav, navBefore(history, mondayStr)),
    monthPct: changePct(latestNav, navBefore(history, `${yStr}-${mStr}-01`)),
    ytdPct: changePct(latestNav, navBefore(history, `${yStr}-01-01`)),
    yearPct: changePct(latestNav, navOnOrBefore(history, `${Y - 1}-${mStr}-${pad2(D)}`)),
  };
}
