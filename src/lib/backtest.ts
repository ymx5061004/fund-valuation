// 预测回测：用历史净值检验「涨跌预测信号」过去表现如何。
//
// ⚠️ 防偷看未来（look-ahead）：每个历史时点 t 只用 t（含）之前的净值算信号，
//    再去比对 t 之后的实际涨跌。绝不把未来数据喂给预测。
// ⚠️ 历史回测表现不代表未来收益（存在过拟合、幸存者偏差等），仅作可信度参照。

import type { Fund } from "./types";
import { predict } from "./prediction";

export interface BacktestResult {
  /** 命中率向后看的交易日数 */
  horizon: number;
  /** 给出方向（看涨/看跌）的次数（震荡不计入） */
  directionalSamples: number;
  /** 命中次数 */
  hits: number;
  /** 方向命中率 0~1 */
  hitRate: number;
  /** 信号策略累计收益 %（看涨持有 / 否则空仓） */
  signalReturn: number;
  /** 一直持有累计收益 %（基准） */
  buyHoldReturn: number;
  /** 策略模拟覆盖的交易日数 */
  days: number;
}

// 预热：保证 MA20 / RSI14 / 近10日动量都有足够数据
const WARMUP = 25;

/** 对单只基金做回测。历史不足时返回 null。 */
export function backtest(fund: Fund, horizon = 5): BacktestResult | null {
  const navs = fund.navHistory.map((p) => p.nav);
  const n = navs.length;
  if (n < WARMUP + horizon + 5) return null;

  const signalAt = (upto: number) =>
    // 只用 navHistory[0..upto-1]（即 upto 个点）计算信号
    predict({ ...fund, navHistory: fund.navHistory.slice(0, upto) }).signal;

  // 1) 方向命中率：在 t 用 [0..t] 算信号，比对 t→t+horizon 的实际涨跌
  let directionalSamples = 0;
  let hits = 0;
  for (let t = WARMUP; t < n - horizon; t++) {
    if (navs[t] <= 0) continue; // 防除零（异常净值）
    const sig = signalAt(t + 1);
    if (sig === "neutral") continue; // 震荡不是方向判断，不计命中率
    const fwd = navs[t + horizon] / navs[t] - 1;
    directionalSamples++;
    if ((sig === "bullish" && fwd > 0) || (sig === "bearish" && fwd < 0)) hits++;
  }

  // 2) 策略 vs 持有：用「昨日信号」决定今日仓位（看涨=满仓，否则空仓），逐日复利
  let stratEquity = 1;
  let holdEquity = 1;
  let days = 0;
  for (let t = WARMUP + 1; t < n; t++) {
    const sigYesterday = signalAt(t); // 用 [0..t-1] 的数据，决定第 t 日仓位
    const dailyRet = navs[t - 1] > 0 ? navs[t] / navs[t - 1] - 1 : 0; // 防除零
    holdEquity *= 1 + dailyRet;
    if (sigYesterday === "bullish") stratEquity *= 1 + dailyRet;
    days++;
  }

  return {
    horizon,
    directionalSamples,
    hits,
    hitRate: directionalSamples > 0 ? hits / directionalSamples : 0,
    signalReturn: (stratEquity - 1) * 100,
    buyHoldReturn: (holdEquity - 1) * 100,
    days,
  };
}
