// 领域类型定义：基金、净值、预测信号

// 常见类型给出字面量提示，同时允许接口返回的任意类型字符串（如“指数型-股票”取“指数型”）
export type FundType = "股票型" | "混合型" | "债券型" | "指数型" | "QDII" | (string & {});

/** 排行榜排序维度：今日涨幅 / 近1月 / 近3月 / 近1年 / 今年来 */
export type RankSort = "rzdf" | "1yzf" | "3yzf" | "1nzf" | "jnzf";

/** 基金检索结果的元信息（来自搜索接口） */
export interface FundMeta {
  code: string;
  name: string;
  type: string;
  manager: string;
  company: string;
}

/** 用户持仓（手动导入） */
export interface Position {
  code: string;
  name: string;
  /** 持有份额 */
  shares: number;
  /** 成本价（单位成本净值） */
  cost: number;
}

/** 实时估值行情（/api/estimate 返回项） */
export interface Quote {
  code: string;
  name: string;
  nav: number;
  estimateNav: number;
  estimateChangePct: number;
  gztime: string;
}

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
