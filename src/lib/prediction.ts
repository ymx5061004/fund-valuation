// 涨跌预测「信号引擎」——基于历史净值的技术指标，输出可解释的方向判断。
//
// ⚠️ 设计要点：这是一个【可替换】的纯函数模块。当前实现用技术指标（透明、零训练），
//    未来若要换成「LLM 研判」或「机器学习模型」，只需保持 predict(fund) 的签名不变，
//    替换内部实现即可，页面与组件无需改动。
//
// ⚠️ 重要：任何方向预测都不构成投资建议，市场有风险。

import type { Fund, Indicators, Prediction, Signal } from "./types";

/** 简单移动平均（取末尾 period 个值；不足则按现有长度计算） */
function sma(values: number[], period: number): number {
  const p = Math.min(period, values.length);
  if (p === 0) return 0;
  const slice = values.slice(-p);
  return slice.reduce((a, b) => a + b, 0) / p;
}

/** RSI 相对强弱指标（默认 14 日） */
function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

/** 近 period 日动量（收益率 %） */
function momentum(values: number[], period = 10): number {
  if (values.length < period + 1) return 0;
  const past = values[values.length - 1 - period];
  const now = values[values.length - 1];
  if (past === 0) return 0;
  return ((now - past) / past) * 100;
}

export function computeIndicators(fund: Fund): Indicators {
  const navs = fund.navHistory.map((p) => p.nav);
  return {
    ma5: Number(sma(navs, 5).toFixed(4)),
    ma20: Number(sma(navs, 20).toFixed(4)),
    rsi14: Number(rsi(navs, 14).toFixed(1)),
    momentum10: Number(momentum(navs, 10).toFixed(2)),
  };
}

/**
 * 综合多个技术指标给出方向信号与打分。
 * 打分权重（可按需调整）：均线方向 ±25、动量 ±30、RSI 超买超卖 ±15。
 */
export function predict(fund: Fund): Prediction {
  const ind = computeIndicators(fund);
  const reasons: string[] = [];
  let score = 0;

  // 1) 均线方向（金叉/死叉）
  if (ind.ma5 > ind.ma20) {
    score += 25;
    reasons.push(`MA5(${ind.ma5}) 高于 MA20(${ind.ma20})，短期均线向上，呈多头排列`);
  } else {
    score -= 25;
    reasons.push(`MA5(${ind.ma5}) 低于 MA20(${ind.ma20})，短期均线走弱，呈空头排列`);
  }

  // 2) 动量（近 10 日收益率，线性映射并封顶 ±30）
  const m = ind.momentum10;
  score += Math.max(-30, Math.min(30, m * 4));
  if (m > 0.5) reasons.push(`近 10 日动量 +${m.toFixed(2)}%，价格处于上升通道`);
  else if (m < -0.5) reasons.push(`近 10 日动量 ${m.toFixed(2)}%，价格处于下降通道`);
  else reasons.push(`近 10 日动量 ${m.toFixed(2)}%，价格横盘震荡`);

  // 3) RSI 超买/超卖（反向修正）
  if (ind.rsi14 >= 70) {
    score -= 15;
    reasons.push(`RSI=${ind.rsi14} 进入超买区(≥70)，存在回调风险`);
  } else if (ind.rsi14 <= 30) {
    score += 15;
    reasons.push(`RSI=${ind.rsi14} 进入超卖区(≤30)，存在反弹机会`);
  } else {
    reasons.push(`RSI=${ind.rsi14} 处于中性区间(30~70)`);
  }

  score = Math.round(Math.max(-100, Math.min(100, score)));

  let signal: Signal;
  if (score >= 15) signal = "bullish";
  else if (score <= -15) signal = "bearish";
  else signal = "neutral";

  // 信号强度：仅反映各指标共振程度，不等于预测准确率
  const confidence = Math.round(Math.min(95, 40 + Math.abs(score) / 2));

  return { signal, score, confidence, indicators: ind, reasons };
}
