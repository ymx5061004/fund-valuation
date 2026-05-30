// 领域类型定义：基金、净值、预测信号

export type FundType = "股票型" | "混合型" | "债券型" | "指数型" | "QDII";

export interface NavPoint {
  /** 交易日，格式 YYYY-MM-DD */
  date: string;
  /** 单位净值 */
  nav: number;
}

export interface Fund {
  /** 基金代码 */
  code: string;
  /** 基金名称 */
  name: string;
  type: FundType;
  /** 基金经理 */
  manager: string;
  /** 最新单位净值（上一交易日收盘） */
  nav: number;
  /** 盘中实时估值 */
  estimateNav: number;
  /** 估值涨跌幅 %（相对上一交易日净值） */
  estimateChangePct: number;
  /** 历史净值序列（约一年交易日） */
  navHistory: NavPoint[];
}

/** 预测方向：偏多 / 偏空 / 震荡（沿用 A 股“红涨绿跌”习惯，多 = 红，空 = 绿） */
export type Signal = "bullish" | "bearish" | "neutral";

export interface Indicators {
  /** 5 日均线 */
  ma5: number;
  /** 20 日均线 */
  ma20: number;
  /** 14 日 RSI 相对强弱指标 */
  rsi14: number;
  /** 近 10 日动量（涨跌幅 %） */
  momentum10: number;
}

export interface Prediction {
  signal: Signal;
  /** 综合打分，-100 ~ 100，正为偏多 */
  score: number;
  /** 信号强度 0 ~ 100（表示信号强弱，并非准确率） */
  confidence: number;
  indicators: Indicators;
  /** 可解释的判断依据（每条对应一个指标） */
  reasons: string[];
}
