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

/** 大盘指数实时行情 */
export interface IndexQuote {
  /** 东方财富 secid，如 1.000001 */
  secid: string;
  code: string;
  name: string;
  /** 当前点位 */
  price: number;
  /** 涨跌点数 */
  change: number;
  /** 涨跌幅 % */
  changePct: number;
}

/** K 线一根（日/周/月） */
export interface KlineCandle {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  /** 成交量（手），活跃筹码市值指数计算用；个别海外指数可能缺失 */
  volume?: number;
  /** 成交额（元），活跃市值(0AMV)计算用；个别海外指数可能缺失 */
  amount?: number;
}

/** 活跃市值(0AMV)单点：近 N 日成交额滚动合计（lib/amv.ts） */
export interface AmvPoint {
  date: string;
  /** 活跃市值（元） */
  amv: number;
  /** 当日收盘点位（与指数走势对比用） */
  close: number;
  /** 当日成交额（元，两市或单指数口径同序列），蜡烛图成交量副图用 */
  amount: number;
}

/** 活跃筹码市值指数蜡烛（lib/amv.ts computeAmvIndex / aggregateAmvCandles）。
 *  口径（用户 2026-07-22 确认换模型要真K线）：近10日成交量合计 × 当日指数 开/高/低/收 ÷ 定标常数——
 *  指数价格有真实盘中 OHLC → 日K 带真实影线；周/月K 由日蜡烛聚合。数值为无量纲指数点数（非金额）。 */
export interface AmvCandle {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  /** 期内成交额合计（元），成交量副图用 */
  amount: number;
}

/** 两市涨跌家数（活跃市值板块的市场宽度） */
export interface MarketBreadth {
  up: number;
  flat: number;
  down: number;
}

/** 活跃市值「独立板块」详情数据（/api/amv，参考指南针 0AMV 板块，公开数据估算的合成指数） */
export interface AmvBoard {
  /** 最新活跃筹码市值指数（点数：近10日两市成交量×沪指收盘÷定标常数） */
  value: number;
  /** 较上一交易日变化（点数） */
  change: number;
  /** 较上一交易日变化 % */
  changePct: number;
  /** 数据对应交易日 YYYY-MM-DD（盘中为上一收盘日，当日未收盘已剔除） */
  date: string;
  /** 今日两市实时成交额（元）；仅盘中（当日 K 线被剔除）时有值，否则 null */
  todayAmount: number | null;
  /** 近10日两市成交额合计（元）——「活跃资金」金额口径的副指标 */
  turnover10: number;
  /** 量额口径：both=沪深两市合计；sh-only=深市 K 线暂缺、仅沪市（绝对值偏低，UI 需注明） */
  coverage: "both" | "sh-only";
  /** 当前是否 A 股交易时段 */
  tradingNow: boolean;
  /** 研判 */
  analysis: AmvAnalysis;
  /** 日线真 OHLC 蜡烛序列（活跃筹码市值指数），最多近约 3 年，客户端聚合出周/月K */
  candles: AmvCandle[];
  /** 两市涨跌家数；上游不支持时 null */
  breadth: MarketBreadth | null;
}

/** 活跃市值研判结果（lib/amv.ts analyzeAmv） */
export interface AmvAnalysis {
  signal: Signal;
  /** 状态短语，如「量价同步 · 上涨可持续」 */
  state: string;
  /** 最新活跃市值（随输入序列口径：面板为元、板块为指数点数） */
  amv: number;
  /** 活跃市值较 5 个交易日前变化 % */
  trend5Pct: number;
  /** 近 20 个交易日指数涨跌 % */
  index20Pct: number;
  /** 近 20 个交易日活跃市值变化 % */
  amv20Pct: number;
  /** 近 60 日窗口的顶/底背离；样本不足或无背离为 null */
  divergence: "top" | "bottom" | null;
  /** 可解释的判断依据 */
  reasons: string[];
}

/** 指数成分股 */
export interface ConstituentStock {
  code: string;
  name: string;
  /** 最新价 */
  price: number;
  /** 涨跌幅 % */
  changePct: number;
  /** 流通市值（元） */
  floatCap: number;
}

/** 指数详情（行情 + 分时） */
export interface IndexDetail {
  secid: string;
  code: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  prevClose: number;
  /** 成交量（手） */
  volume: number;
  /** 成交额（元） */
  amount: number;
  /** 分时点（时间 HH:MM + 点位） */
  trend: { time: string; price: number }[];
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

/** 自选列表用的多指标行情（/api/quotes 返回项），涨跌幅为 % 或 null（数据不足） */
export interface QuoteMetrics {
  code: string;
  name: string;
  /** 最新已公布净值 */
  nav: number;
  navDate: string;
  /** 当日估值 */
  estimateNav: number;
  /** 估值涨幅 %（盘中估算） */
  estimateChangePct: number;
  /** 估值是否有效（对应日尚未公布净值＝盘中/待结算）；false 表示估值已过期，UI 应显示「--」 */
  estimateFresh: boolean;
  /** 当日涨幅 %：今日净值未公布(盘中/待结算)用估值涨幅，否则用官方确认涨幅 */
  dayChangePct: number;
  /** 与 dayChangePct 同口径的净值：估算时=当日估值，否则=最新净值 */
  dayNav: number;
  /** dayChangePct 是否为估算值（用于显示「估」标记） */
  dayEstimated: boolean;
  weekPct: number | null;
  monthPct: number | null;
  ytdPct: number | null;
  yearPct: number | null;
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
