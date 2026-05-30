// 演示用假数据。⚠️ 全部为程序生成的虚构数据，不代表任何真实基金的真实表现。
//
// 接入真实数据时：把 getFunds() 换成调用真实接口（如天天基金 / 自建数据服务），
// 返回相同的 Fund[] 结构即可，上层组件无需改动。

import type { Fund, FundType, NavPoint } from "./types";

/** 可复现的伪随机数生成器（mulberry32）。
 *  用固定种子保证服务端与客户端生成完全一致的数据，避免 React 注水(hydration)不一致。 */
function mulberry32(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 生成最近 count 个“交易日”日期（简单跳过周末），以 2026-05-29 为基准向前推。 */
function tradingDates(count: number): string[] {
  const dates: string[] = [];
  // 固定基准日，保证演示数据稳定可复现
  const d = new Date(2026, 4, 29); // 月份从 0 开始：4 = 5 月
  while (dates.length < count) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) {
      dates.unshift(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    }
    d.setDate(d.getDate() - 1);
  }
  return dates;
}

/** 用随机游走构造一段净值序列 */
function buildNavHistory(
  seed: number,
  startNav: number,
  drift: number,
  vol: number,
  dates: string[],
): NavPoint[] {
  const rand = mulberry32(seed);
  let nav = startNav;
  return dates.map((date) => {
    // 三个均匀分布求和近似正态分布，范围约 [-1.5, 1.5]
    const shock = rand() + rand() + rand() - 1.5;
    const ret = drift + vol * shock;
    nav = Math.max(0.2, nav * (1 + ret));
    return { date, nav: Number(nav.toFixed(4)) };
  });
}

interface FundSeed {
  code: string;
  name: string;
  type: FundType;
  manager: string;
  start: number;
  /** 日漂移（趋势） */
  drift: number;
  /** 日波动率 */
  vol: number;
  seed: number;
}

// 覆盖不同走势（上行/下行/震荡）以便演示不同预测信号
const SEEDS: FundSeed[] = [
  { code: "501001", name: "晨星成长精选混合", type: "混合型", manager: "李明远", start: 2.1, drift: 0.0012, vol: 0.013, seed: 1001 },
  { code: "501002", name: "鹏华科技先锋股票", type: "股票型", manager: "王思齐", start: 3.4, drift: 0.0018, vol: 0.02, seed: 1002 },
  { code: "501003", name: "嘉沪深300指数增强", type: "指数型", manager: "赵宏", start: 1.6, drift: 0.0004, vol: 0.011, seed: 1003 },
  { code: "501004", name: "稳健纯债债券A", type: "债券型", manager: "孙立", start: 1.15, drift: 0.0002, vol: 0.0018, seed: 1004 },
  { code: "501005", name: "全球互联QDII", type: "QDII", manager: "陈宇", start: 1.9, drift: -0.0006, vol: 0.018, seed: 1005 },
  { code: "501006", name: "新能源动力混合", type: "混合型", manager: "周航", start: 2.7, drift: -0.0014, vol: 0.022, seed: 1006 },
  { code: "501007", name: "消费龙头股票", type: "股票型", manager: "吴敏", start: 4.2, drift: 0.0009, vol: 0.016, seed: 1007 },
  { code: "501008", name: "医药健康混合", type: "混合型", manager: "郑磊", start: 1.85, drift: 0.0003, vol: 0.017, seed: 1008 },
];

const DAYS = 250; // 约一年交易日

function buildFund(s: FundSeed, dates: string[]): Fund {
  const navHistory = buildNavHistory(s.seed, s.start, s.drift, s.vol, dates);
  const last = navHistory[navHistory.length - 1].nav;
  // 盘中估值：在最新净值基础上叠加一个当日波动
  const rand = mulberry32(s.seed + 99991);
  const intraday = (rand() - 0.45) * 2 * s.vol * 2.5;
  const estimateNav = Number((last * (1 + intraday)).toFixed(4));
  const estimateChangePct = Number((((estimateNav - last) / last) * 100).toFixed(2));
  return {
    code: s.code,
    name: s.name,
    type: s.type,
    manager: s.manager,
    nav: last,
    estimateNav,
    estimateChangePct,
    navHistory,
  };
}

/** 获取全部基金（演示数据）。真实场景替换为接口调用即可。 */
export function getFunds(): Fund[] {
  const dates = tradingDates(DAYS);
  return SEEDS.map((s) => buildFund(s, dates));
}
