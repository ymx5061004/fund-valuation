// 梅花易数「数字起卦」娱乐模块 —— 与 prediction.ts 的技术指标信号引擎完全独立。
//
// ⚠️ 定位是传统文化娱乐内容，不是分析功能：
// - 严禁并入 predict() 的综合打分或任何技术信号权重；
// - UI 展示必须保留「仅供娱乐」标识与免责声明。
//
// 起卦方法（数字起卦的确定性变体，公历）：同一基金对同一预测日的卦象恒定，刷新不变。
//   数基 = 预测日的 年+月+日
//   上卦 = (代码前三位数字和 + 数基) % 8，余 0 取 8（先天八卦数：乾一兑二离三震四巽五坎六艮七坤八）
//   下卦 = (代码后三位数字和 + 数基) % 8，余 0 取 8
//   动爻 = (代码六位数字和 + 数基) % 6，余 0 取 6（自下而上数）
// 断卦用体用五行生克：动爻所在之卦为「用」，另一卦为「体」；
//   用生体=大吉、比和=吉、体克用=小吉、体生用=小凶、用克体=凶。

/** 五行 */
type Element = "金" | "木" | "水" | "火" | "土";

/** 八卦（三爻，自下而上，1=阳 0=阴） */
export interface Trigram {
  /** 先天卦数 1~8 */
  num: number;
  name: string;
  /** 卦符，如 ☰ */
  symbol: string;
  /** 自然取象，如 天 */
  nature: string;
  element: Element;
  lines: readonly [number, number, number];
}

/** 先天八卦，下标 = 卦数 - 1 */
export const TRIGRAMS: readonly Trigram[] = [
  { num: 1, name: "乾", symbol: "☰", nature: "天", element: "金", lines: [1, 1, 1] },
  { num: 2, name: "兑", symbol: "☱", nature: "泽", element: "金", lines: [1, 1, 0] },
  { num: 3, name: "离", symbol: "☲", nature: "火", element: "火", lines: [1, 0, 1] },
  { num: 4, name: "震", symbol: "☳", nature: "雷", element: "木", lines: [1, 0, 0] },
  { num: 5, name: "巽", symbol: "☴", nature: "风", element: "木", lines: [0, 1, 1] },
  { num: 6, name: "坎", symbol: "☵", nature: "水", element: "水", lines: [0, 1, 0] },
  { num: 7, name: "艮", symbol: "☶", nature: "山", element: "土", lines: [0, 0, 1] },
  { num: 8, name: "坤", symbol: "☷", nature: "地", element: "土", lines: [0, 0, 0] },
] as const;

/** 六十四卦名，[上卦数-1][下卦数-1]，卦序均按先天数（乾兑离震巽坎艮坤） */
const HEX_NAMES: readonly (readonly string[])[] = [
  ["乾为天", "天泽履", "天火同人", "天雷无妄", "天风姤", "天水讼", "天山遁", "天地否"],
  ["泽天夬", "兑为泽", "泽火革", "泽雷随", "泽风大过", "泽水困", "泽山咸", "泽地萃"],
  ["火天大有", "火泽睽", "离为火", "火雷噬嗑", "火风鼎", "火水未济", "火山旅", "火地晋"],
  ["雷天大壮", "雷泽归妹", "雷火丰", "震为雷", "雷风恒", "雷水解", "雷山小过", "雷地豫"],
  ["风天小畜", "风泽中孚", "风火家人", "风雷益", "巽为风", "风水涣", "风山渐", "风地观"],
  ["水天需", "水泽节", "水火既济", "水雷屯", "坎为水", "水风井", "水山蹇", "水地比"],
  ["山天大畜", "山泽损", "山火贲", "山雷颐", "艮为山", "山风蛊", "山水蒙", "山地剥"],
  ["地天泰", "地泽临", "地火明夷", "地雷复", "坤为地", "地风升", "地水师", "地山谦"],
] as const;

/** X 生 Y（木生火、火生土、土生金、金生水、水生木） */
const SHENG: Record<Element, Element> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
/** X 克 Y（木克土、土克水、水克火、火克金、金克木） */
const KE: Record<Element, Element> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

export type MeihuaRelation = "用生体" | "比和" | "体克用" | "体生用" | "用克体";
export type MeihuaLuck = "大吉" | "吉" | "小吉" | "小凶" | "凶";

const RELATION_META: Record<MeihuaRelation, { luck: MeihuaLuck; direction: 1 | -1; tendency: string; note: string }> = {
  用生体: { luck: "大吉", direction: 1, tendency: "看涨之象", note: "用卦之气来生体卦，主进益顺遂" },
  比和: { luck: "吉", direction: 1, tendency: "偏涨之象", note: "体用五行比和，气机和顺" },
  体克用: { luck: "小吉", direction: 1, tendency: "涨中有阻之象", note: "体卦克制用卦，事可成而费力" },
  体生用: { luck: "小凶", direction: -1, tendency: "偏跌之象", note: "体卦之气外泄于用卦，主耗损" },
  用克体: { luck: "凶", direction: -1, tendency: "看跌之象", note: "用卦来克体卦，主受制不利" },
};

export interface MeihuaReading {
  /** 预测目标交易日 YYYY-MM-DD */
  targetDate: string;
  /** 本卦六爻，自下而上（1=阳 0=阴） */
  lines: number[];
  /** 动爻位置 1~6（自下而上） */
  movingLine: number;
  upper: Trigram;
  lower: Trigram;
  hexName: string;
  /** 变卦（动爻阴阳互变） */
  changedLines: number[];
  changedHexName: string;
  /** 互卦（2~4 爻为下互、3~5 爻为上互） */
  mutualHexName: string;
  /** 体卦是否为上卦（动爻在下卦则体在上，反之在下） */
  bodyIsUpper: boolean;
  body: Trigram;
  use: Trigram;
  relation: MeihuaRelation;
  luck: MeihuaLuck;
  /** 1 偏涨 / -1 偏跌（配色用，遵循红涨绿跌） */
  direction: 1 | -1;
  /** 断语，如「看涨之象」 */
  tendency: string;
  /** 生克解释，如「用卦离(火)生体卦坤(土)」 */
  explanation: string;
}

function digitSum(s: string): number {
  return s.split("").reduce((acc, ch) => acc + Number(ch), 0);
}

function trigramByLines(lines: number[]): Trigram {
  const found = TRIGRAMS.find((t) => t.lines[0] === lines[0] && t.lines[1] === lines[1] && t.lines[2] === lines[2]);
  // 三爻的 8 种组合与 TRIGRAMS 一一对应，理论上必命中；兜底坤卦防御性返回
  return found ?? TRIGRAMS[7];
}

function hexNameOf(lowerLines: number[], upperLines: number[]): string {
  const lo = trigramByLines(lowerLines);
  const up = trigramByLines(upperLines);
  return HEX_NAMES[up.num - 1][lo.num - 1];
}

/** 体用五行生克关系 */
function relationOf(body: Element, use: Element): MeihuaRelation {
  if (body === use) return "比和";
  if (SHENG[use] === body) return "用生体";
  if (SHENG[body] === use) return "体生用";
  if (KE[use] === body) return "用克体";
  return "体克用"; // 五行两两之间非生即克，剩余情形必为体克用
}

/** A 股主要法定休市日（需每年维护，国务院每年 11 月左右公布次年安排；
 *  只收录高置信的休市日——春节/国庆黄金周、固定节日及节日观察日；
 *  表不全时优雅退化为只跳周末，临时休市以交易所公告为准）。 */
const MARKET_HOLIDAYS = new Set<string>([
  // 2026：元旦 / 春节(除夕~初六，初一 02-17) / 清明(04-05 周日顺延 04-06) / 五一 / 端午 / 中秋 / 国庆
  "2026-01-01",
  "2026-02-16", "2026-02-17", "2026-02-18", "2026-02-19", "2026-02-20",
  "2026-04-06",
  "2026-05-01",
  "2026-06-19",
  "2026-09-25",
  "2026-10-01", "2026-10-02", "2026-10-05", "2026-10-06", "2026-10-07",
  // 2027：元旦 / 春节(初一 02-06 周六，节后休市约至 02-11) / 清明 / 五一观察日 / 端午 / 国庆
  "2027-01-01",
  "2027-02-05", "2027-02-08", "2027-02-09", "2027-02-10", "2027-02-11",
  "2027-04-05",
  "2027-05-03",
  "2027-06-09",
  "2027-10-01", "2027-10-04", "2027-10-05", "2027-10-06", "2027-10-07",
]);

/** 目标交易日 = 下一个「尚未收盘」的交易日（YYYY-MM-DD，北京时间）：
 *  交易日 15:00 收盘前返回当天（当日涨跌未定，卦断的就是今天）；
 *  收盘后/周末/休市日推进到下一个交易日。跳周末 + 上表法定休市日。 */
export function nextTradingDay(): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) => `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
  const tradable = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6 && !MARKET_HOLIDAYS.has(fmt(d));

  const bj = new Date(Date.now() + 8 * 3600000);
  if (bj.getUTCHours() < 15 && tradable(bj)) return fmt(bj);
  do {
    bj.setUTCDate(bj.getUTCDate() + 1);
  } while (!tradable(bj));
  return fmt(bj);
}

/** 按基金代码 + 目标日起卦。代码非 6 位数字或日期非 YYYY-MM-DD 返回 null。 */
export function castMeihua(code: string, targetDate: string): MeihuaReading | null {
  if (!/^\d{6}$/.test(code)) return null;
  // 严格格式校验：宽松的 Number 解析会让 "2026-07-" 这类畸形串静默算出错误的卦
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  const parts = targetDate.split("-").map(Number);
  const dateSum = parts[0] + parts[1] + parts[2];

  const front = digitSum(code.slice(0, 3));
  const back = digitSum(code.slice(3));
  const upperNum = (front + dateSum) % 8 || 8;
  const lowerNum = (back + dateSum) % 8 || 8;
  const movingLine = (front + back + dateSum) % 6 || 6;

  const upper = TRIGRAMS[upperNum - 1];
  const lower = TRIGRAMS[lowerNum - 1];
  const lines = [...lower.lines, ...upper.lines];

  const changedLines = [...lines];
  changedLines[movingLine - 1] = changedLines[movingLine - 1] === 1 ? 0 : 1;

  // 动爻在下卦（1~3 爻）则下卦为用、上卦为体；动爻在上卦（4~6 爻）反之
  const bodyIsUpper = movingLine <= 3;
  const body = bodyIsUpper ? upper : lower;
  const use = bodyIsUpper ? lower : upper;

  const relation = relationOf(body.element, use.element);
  const meta = RELATION_META[relation];

  const explanation =
    relation === "比和"
      ? `体卦${body.name}(${body.element})与用卦${use.name}(${use.element})五行比和`
      : relation === "用生体"
        ? `用卦${use.name}(${use.element})生体卦${body.name}(${body.element})`
        : relation === "体生用"
          ? `体卦${body.name}(${body.element})生用卦${use.name}(${use.element})`
          : relation === "用克体"
            ? `用卦${use.name}(${use.element})克体卦${body.name}(${body.element})`
            : `体卦${body.name}(${body.element})克用卦${use.name}(${use.element})`;

  return {
    targetDate,
    lines,
    movingLine,
    upper,
    lower,
    hexName: HEX_NAMES[upperNum - 1][lowerNum - 1],
    changedLines,
    changedHexName: hexNameOf(changedLines.slice(0, 3), changedLines.slice(3)),
    mutualHexName: hexNameOf(lines.slice(1, 4), lines.slice(2, 5)),
    bodyIsUpper,
    body,
    use,
    relation,
    luck: meta.luck,
    direction: meta.direction,
    tendency: meta.tendency,
    explanation: `${explanation}，${meta.note}`,
  };
}
