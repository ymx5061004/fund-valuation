// 备用行情源（新浪 / 腾讯）：仅在天天基金/东财主源失败时启用，字段映射与主源口径一致。
//
// ⚠️ 同为非官方接口，注意事项：
// - hq.sinajs.cn 必须带新浪 Referer，否则 403；
// - 两家返回都是 GBK 编码，需 TextDecoder("gb18030") 解码（数字字段是 ASCII，解码失败也可退化使用）；
// - 腾讯基金盘中估值接口 fundSsgz 已冻结（数据停在 2023-08），勿接入——估值备源用新浪 fu_。

import type { IndexQuote, KlineCandle } from "./types";
import type { Estimate } from "./eastmoney";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";

/** 抓取 GBK 编码的行情文本；失败返回 null（由调用方决定兜底）。 */
async function fetchGbk(
  url: string,
  referer: string,
  revalidate: number,
  timeoutMs = 5000,
): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: referer },
      next: { revalidate },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    try {
      return new TextDecoder("gb18030").decode(buf);
    } catch {
      // 无 ICU 的运行时退化为 UTF-8：中文名会乱码，但数值字段不受影响
      return new TextDecoder().decode(buf);
    }
  } catch {
    return null;
  }
}

/**
 * 新浪批量实时估值（fu_{code}）：天天基金 gz 的备源，语义等价——
 * 估值涨幅相对昨日净值（dwjz），分钟级更新；且支持一次请求查多只。
 * 返回条目顺序不保证，调用方按 code 归并。
 */
export async function fetchSinaEstimates(codes: string[]): Promise<Estimate[]> {
  if (codes.length === 0) return [];
  const list = codes.map((c) => `fu_${c}`).join(",");
  const text = await fetchGbk(`https://hq.sinajs.cn/list=${list}`, "https://finance.sina.com.cn/", 15);
  if (!text) return [];

  const out: Estimate[] = [];
  // 每行形如 var hq_str_fu_161725="招商中证白酒指数A,10:09:00,0.5096,0.5080,2.2241,0,0.315,2026-07-14,0.5092,0.2362";
  // 字段：[0]名称 [1]时间HH:MM:SS [2]估值 [3]昨日净值 [4]累计净值 [6]估值涨幅% [7]日期
  const re = /hq_str_fu_(\d{6})="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const parts = m[2].split(",");
    if (parts.length < 8) continue; // 无估值数据的基金返回空串
    const estimateNav = Number(parts[2]);
    const nav = Number(parts[3]);
    if (!Number.isFinite(estimateNav) || estimateNav <= 0 || !Number.isFinite(nav) || nav <= 0) continue;
    out.push({
      code: m[1],
      name: parts[0] || m[1],
      nav,
      estimateNav,
      estimateChangePct: Number(parts[6]) || 0,
      // 对齐天天基金 gztime 格式 "YYYY-MM-DD HH:MM"（fetchQuoteMetrics 依赖其前 10 位判断估值日）
      gztime: `${parts[7]} ${parts[1].slice(0, 5)}`,
    });
  }
  return out;
}

// 东财 secid → 腾讯行情代码。日经 225（100.N225）腾讯无对应代码，回退时缺席由调用方容忍。
const SECID_TO_QT: Record<string, string> = {
  "1.000001": "sh000001",
  "0.399001": "sz399001",
  "0.399006": "sz399006",
  "1.000300": "sh000300",
  "1.000016": "sh000016",
  "1.000905": "sh000905",
  "1.000688": "sh000688",
  "0.899050": "bj899050",
  "100.HSI": "hkHSI",
  "100.HSTECH": "hkHSTECH",
  "100.DJIA": "usDJI",
  // ⚠️ 东财 100.NDX 是纳斯达克「综合」指数（实测 2.5 万点级），对应腾讯 usIXIC；
  //    腾讯 usNDX 是纳斯达克 100（2.9 万点级），别映射错
  "100.NDX": "usIXIC",
  "100.SPX": "usINX",
};

// 指数名固定，直接静态维护——不依赖 GBK 解码成功
const SECID_NAMES: Record<string, string> = {
  "1.000001": "上证指数",
  "0.399001": "深证成指",
  "0.399006": "创业板指",
  "1.000300": "沪深300",
  "1.000016": "上证50",
  "1.000905": "中证500",
  "1.000688": "科创50",
  "0.899050": "北证50",
  "100.HSI": "恒生指数",
  "100.HSTECH": "恒生科技",
  "100.DJIA": "道琼斯",
  "100.NDX": "纳斯达克",
  "100.SPX": "标普500",
};

/**
 * 腾讯指数行情（qt.gtimg.cn）：东财 push2/push2delay 全挂时的备源。
 * ⚠️ 腾讯各市场（A股/港股/美股）的字段位置不一致，只有 [3]现价 [4]昨收全市场一致——
 * 涨跌点与涨跌幅一律自行计算，不读腾讯给的位置不定的字段。
 */
export async function fetchTencentIndices(secids: string[]): Promise<IndexQuote[]> {
  const known = secids.filter((s) => SECID_TO_QT[s]);
  if (known.length === 0) return [];
  const q = known.map((s) => SECID_TO_QT[s]).join(",");
  const text = await fetchGbk(`https://qt.gtimg.cn/q=${q}`, "https://gu.qq.com/", 5, 3000);
  if (!text) return [];

  const out: IndexQuote[] = [];
  for (const secid of known) {
    const sym = SECID_TO_QT[secid];
    const m = text.match(new RegExp(`v_${sym}="([^"]*)"`));
    if (!m) continue;
    const f = m[1].split("~");
    const price = Number(f[3]);
    const prevClose = Number(f[4]);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(prevClose) || prevClose <= 0) continue;
    out.push({
      secid,
      code: secid.split(".")[1] ?? sym,
      name: SECID_NAMES[secid] ?? f[1] ?? sym,
      price,
      change: Number((price - prevClose).toFixed(2)),
      changePct: Number((((price - prevClose) / prevClose) * 100).toFixed(2)),
    });
  }
  return out;
}

/**
 * 新浪日 K 线备源（东财 kline 被封/限流时用，2026-07-22 东财曾对数据中心 IP 段封 kline 数小时）。
 * 仅支持 A 股类 secid（1.→sh / 0.→sz）与日 K；返回 UTF JSON 数组 [{day,open,high,low,close,volume}]。
 * ⚠️ 口径差异：volume 单位是「股」，÷100 归一到与东财 f56 相同的「手」；**没有成交额字段**——
 * 返回的 KlineCandle 不带 amount，额类指标（10日额/今日额/成交额副图）由 UI 侧检测缺失后隐藏降级。
 */
export async function fetchSinaKline(secid: string, datalen = 900): Promise<KlineCandle[] | null> {
  const [mkt, code] = secid.split(".");
  if ((mkt !== "0" && mkt !== "1") || !/^\d{6}$/.test(code ?? "")) return null; // 仅 A 股指数/证券代码
  const symbol = `${mkt === "1" ? "sh" : "sz"}${code}`;
  try {
    const url = `https://quotes.sina.cn/cn/api/json_v2.php/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=240&ma=no&datalen=${datalen}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Referer: "https://finance.sina.com.cn" },
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const rows = JSON.parse(await res.text()) as { day: string; open: string; high: string; low: string; close: string; volume: string }[];
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const out: KlineCandle[] = [];
    for (const r of rows) {
      const open = Number(r.open);
      const close = Number(r.close);
      const high = Number(r.high);
      const low = Number(r.low);
      const volGu = Number(r.volume);
      if (!r.day || !Number.isFinite(close) || close <= 0) continue;
      out.push({
        date: r.day,
        open,
        close,
        high,
        low,
        // 股 → 手（÷100），与东财 f56 同单位；活跃筹码市值指数的定标依赖该单位一致性
        ...(Number.isFinite(volGu) && volGu > 0 ? { volume: volGu / 100 } : {}),
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}
