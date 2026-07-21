// 活跃市值（0AMV）信号引擎：统计「真正参与交易的活跃资金体量」。
// 长期锁定不动的筹码（大股东持股等"死筹"）不产生成交额，因此用近 N 日成交额滚动合计
// 作为活跃资金/浮动筹码市值的代理指标——比单日成交额更平滑、更能反映资金体量趋势。
// 四大用途：①大盘趋势与真假涨跌 ②放量上涨是真行情还是诱多 ③顶/底背离识别牛熊拐点 ④资金进出强弱。
// 与 prediction.ts / meihua.ts 一样是独立引擎：纯函数、look-ahead 安全（只用已收盘数据），
// 不并入 predict() 打分。仅为大盘趋势参考，不构成投资建议。

import type { AmvAnalysis, AmvPoint, KlineCandle, Signal } from "@/lib/types";

/** 板块详情返回给客户端的日线上限（≈3 年交易日）：够月视图(36)/周视图(150)/日视图(slice 160)，又不至传全量 */
export const AMV_BOARD_HISTORY = 750;

/** 活跃市值滚动窗口（交易日）：近 10 日成交额合计 ≈ 一轮完整换手的活跃资金体量 */
export const AMV_WINDOW = 10;
/** 趋势观察窗（交易日）：指数 vs 活跃市值的同步性按近 20 日对比 */
const SYNC_WINDOW = 20;
/** 背离检测窗口：近 30 个交易日极值 vs 再前 30 个交易日极值 */
const DIV_WINDOW = 60;
/** 活跃市值显著变化阈值 %（小于该幅度视为走平，避免噪声翻转信号） */
const AMV_TH = 3;
/** 指数显著涨跌阈值 % */
const INDEX_TH = 1;
/** 最少样本：同步窗 20 + 趋势窗 5 + 当前点 */
const MIN_POINTS = 26;

function pctChange(cur: number, prev: number): number {
  return prev > 0 ? ((cur - prev) / prev) * 100 : 0;
}

function fmtSigned(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/** 北京时间当天 YYYY-MM-DD（epoch+8h 后读 UTC 墙钟，与运行时区无关，服务端/客户端通用） */
function beijingToday(): string {
  const bj = new Date(Date.now() + 8 * 3600000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${bj.getUTCFullYear()}-${pad(bj.getUTCMonth() + 1)}-${pad(bj.getUTCDate())}`;
}

/** 各市场收盘缓冲线（北京时间，分钟）：过此时刻视当日 K 线为完整、可计入。
 *  未识别市场返回 Infinity —— 交易日内一律剔除当日末根（宁可少一天新鲜度，也不让未收盘成交额污染 AMV）。
 *  美股(100.DJIA/NDX/SPX)无 f57 成交额、会被 computeAmvSeries 整体过滤，走空态，无需列出。 */
function closeBufferMin(secid: string): number {
  if (secid.startsWith("0.") || secid.startsWith("1.")) return 15 * 60 + 10; // A 股 15:00 收
  if (secid === "100.HSI" || secid === "100.HSTECH") return 16 * 60 + 10; // 港股 16:00 收
  if (secid === "100.N225") return 14 * 60 + 10; // 日经 225：东京 15:00 收 = 北京 14:00
  return Infinity;
}

/** 盘中剔除未收盘的当日 K 线（当日成交额不完整，计入会让活跃市值末点失真下坠）。
 *  按 secid 所属市场的收盘时间判定：过收盘缓冲线才视为完整并计入。传 secid 以支持 A 股/港股/日经等
 *  不同收盘时间（曾只处理 A 股，港股盘中会误报信号）；不做节假日判断（误判只是多显示一天，反之污染数据）。 */
export function dropUnfinishedToday(candles: KlineCandle[], secid: string): KlineCandle[] {
  const last = candles[candles.length - 1];
  if (!last || last.date !== beijingToday()) return candles;
  const bj = new Date(Date.now() + 8 * 3600000);
  const day = bj.getUTCDay();
  const mins = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  // 周末无实时交易；工作日过收盘缓冲线 → 当日 K 线已完整，保留。否则剔除未收盘当日末根。
  const closed = day === 0 || day === 6 || mins >= closeBufferMin(secid);
  return closed ? candles : candles.slice(0, -1);
}

/** 由日 K 计算活跃市值序列：AMV_t = 近 window 个交易日成交额之和。
 *  缺成交额的指数（海外个别）返回空数组，调用方显示「暂无数据」。 */
export function computeAmvSeries(candles: KlineCandle[], window = AMV_WINDOW): AmvPoint[] {
  const usable = candles.filter((c) => typeof c.amount === "number" && c.amount > 0);
  if (usable.length < window + 5) return [];
  const points: AmvPoint[] = [];
  let sum = 0;
  for (let i = 0; i < usable.length; i++) {
    sum += usable[i].amount as number;
    if (i >= window) sum -= usable[i - window].amount as number;
    if (i >= window - 1) points.push({ date: usable[i].date, amv: sum, close: usable[i].close });
  }
  return points;
}

/** 研判活跃市值：趋势 / 指数同步性（真假涨跌）/ 顶底背离。样本不足返回 null。 */
export function analyzeAmv(points: AmvPoint[]): AmvAnalysis | null {
  if (points.length < MIN_POINTS) return null;
  const last = points[points.length - 1];
  const trend5Pct = pctChange(last.amv, points[points.length - 6].amv);
  const base = points[points.length - 1 - SYNC_WINDOW];
  const index20Pct = pctChange(last.close, base.close);
  const amv20Pct = pctChange(last.amv, base.amv);

  // 背离检测：近 30 日极值 vs 再前 30 日极值（只用已收盘数据，look-ahead 安全）
  let divergence: "top" | "bottom" | null = null;
  const hasDivSample = points.length >= DIV_WINDOW;
  if (hasDivSample) {
    const recent = points.slice(-DIV_WINDOW / 2);
    const prior = points.slice(-DIV_WINDOW, -DIV_WINDOW / 2);
    const closes = (a: AmvPoint[]) => a.map((p) => p.close);
    const amvs = (a: AmvPoint[]) => a.map((p) => p.amv);
    // 顶背离：指数高点抬高，活跃市值高点反而降低（活跃资金不再加码）
    if (Math.max(...closes(recent)) > Math.max(...closes(prior)) && Math.max(...amvs(recent)) < Math.max(...amvs(prior)) * (1 - AMV_TH / 100)) {
      divergence = "top";
    }
    // 底背离：指数低点创新低，活跃市值低点止跌企稳（资金悄悄低吸）
    else if (Math.min(...closes(recent)) < Math.min(...closes(prior)) && Math.min(...amvs(recent)) > Math.min(...amvs(prior)) * (1 + AMV_TH / 100)) {
      divergence = "bottom";
    }
  }

  const idxUp = index20Pct >= INDEX_TH;
  const idxDown = index20Pct <= -INDEX_TH;
  const amvUp = amv20Pct >= AMV_TH;
  const amvDown = amv20Pct <= -AMV_TH;

  // 状态判定（背离优先——拐点信号比趋势同步性更重要）
  let state: string;
  let signal: Signal;
  if (divergence === "top") {
    state = "顶背离 · 见顶风险";
    signal = "bearish";
  } else if (divergence === "bottom") {
    state = "底背离 · 关注低吸";
    signal = "bullish";
  } else if (idxUp && amvDown) {
    state = "指数虚涨 · 谨慎追高";
    signal = "bearish";
  } else if (idxUp && amvUp) {
    state = "量价同步 · 上涨可持续";
    signal = "bullish";
  } else if (idxDown && amvUp) {
    state = "资金逢低布局 · 关注反弹";
    signal = "bullish";
  } else if (idxDown && amvDown) {
    state = "资金离场 · 控制仓位";
    signal = "bearish";
  } else if (amvUp) {
    state = "活跃资金进场";
    signal = "bullish";
  } else if (amvDown) {
    state = "活跃资金离场";
    signal = "bearish";
  } else {
    state = "量价平稳 · 震荡";
    signal = "neutral";
  }

  const reasons: string[] = [
    `近 5 个交易日活跃市值${fmtSigned(trend5Pct)}，${
      trend5Pct >= AMV_TH ? "场外资金持续进场" : trend5Pct <= -AMV_TH ? "活跃资金正在离场" : "资金体量基本平稳"
    }`,
    `近 ${SYNC_WINDOW} 日指数${fmtSigned(index20Pct)}、活跃市值${fmtSigned(amv20Pct)}：${
      idxUp && amvDown
        ? "指数涨但活跃资金未跟上，疑似存量倒手/诱多"
        : idxUp && amvUp
          ? "上涨伴随资金进场，量价健康"
          : idxDown && amvUp
            ? "指数回调但资金逆势流入，或在逢低布局"
            : idxDown && amvDown
              ? "量价齐缩，存量博弈市况偏弱"
              : "量价均无显著方向"
    }`,
    divergence === "top"
      ? `近 ${DIV_WINDOW} 日检出顶背离：指数高点抬高、活跃市值高点未跟上，活跃资金不再加码`
      : divergence === "bottom"
        ? `近 ${DIV_WINDOW} 日检出底背离：指数创新低、活跃市值止跌企稳，资金疑似悄悄低吸`
        : hasDivSample
          ? `近 ${DIV_WINDOW} 日未检出顶/底背离`
          : `样本不足 ${DIV_WINDOW} 个交易日，暂未做背离检测`,
  ];

  return { signal, state, amv: last.amv, trend5Pct, index20Pct, amv20Pct, divergence, reasons };
}

/** 金额中文格式化：元 → 亿/万亿（保留 2 位） */
export function formatAmountCN(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}万亿`;
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return v.toFixed(0);
}

/** 活跃市值日涨跌（相对上一交易日）。样本不足返回 null。 */
export function amvChange(points: AmvPoint[]): { value: number; change: number; changePct: number; date: string } | null {
  if (points.length < 2) return null;
  const last = points[points.length - 1];
  const prev = points[points.length - 2];
  const change = last.amv - prev.amv;
  return { value: last.amv, change, changePct: prev.amv > 0 ? (change / prev.amv) * 100 : 0, date: last.date };
}

/** 把日线活跃市值序列重采样为周/月线（取每组最后一个交易日的值作为该周期收盘）。
 *  日频估算无 OHLC，周/月视图同为折线；仅降低频率、不改口径。 */
export function resampleAmv(points: AmvPoint[], period: "week" | "month"): AmvPoint[] {
  const keyOf = (d: string): string => {
    if (period === "month") return d.slice(0, 7); // YYYY-MM
    const [y, m, day] = d.split("-").map(Number);
    const dt = new Date(y, m - 1, day);
    const jan1 = new Date(y, 0, 1);
    const week = Math.ceil(((dt.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
    return `${y}-W${week}`;
  };
  const out: AmvPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const nextKey = i + 1 < points.length ? keyOf(points[i + 1].date) : null;
    if (keyOf(points[i].date) !== nextKey) out.push(points[i]); // 组内最后一根 = 周期收盘
  }
  return out;
}

/** 当前是否 A 股交易时段（北京时间周一~五 9:30–11:30 / 13:00–15:00）。服务端可用（Date.now，非工作流脚本）。 */
export function isAShareTradingNow(): boolean {
  const bj = new Date(Date.now() + 8 * 3600000);
  const day = bj.getUTCDay();
  if (day === 0 || day === 6) return false;
  const m = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  return (m >= 9 * 60 + 30 && m <= 11 * 60 + 30) || (m >= 13 * 60 && m <= 15 * 60);
}
