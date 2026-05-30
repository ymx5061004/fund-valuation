import type { FundType } from "@/lib/types";
import { cn } from "@/lib/utils";

export type SortKey = "change-desc" | "change-asc" | "name" | "signal";

const TYPE_OPTIONS: (FundType | "all")[] = ["all", "股票型", "混合型", "债券型", "指数型", "QDII"];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "change-desc", label: "估值涨幅 高→低" },
  { value: "change-asc", label: "估值涨幅 低→高" },
  { value: "signal", label: "预测：看涨优先" },
  { value: "name", label: "名称" },
];

interface Props {
  query: string;
  onQuery: (v: string) => void;
  type: FundType | "all";
  onType: (v: FundType | "all") => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  onlyWatch: boolean;
  onOnlyWatch: (v: boolean) => void;
  watchCount: number;
  resultCount: number;
}

const selectClass =
  "rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";

export function FundToolbar(props: Props) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {/* 搜索 */}
      <div className="relative flex-1 sm:min-w-[200px]">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">🔍</span>
        <input
          value={props.query}
          onChange={(e) => props.onQuery(e.target.value)}
          placeholder="搜索名称 / 代码 / 经理"
          className="w-full rounded-lg border border-zinc-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:ring-blue-900"
        />
      </div>

      {/* 类型筛选 */}
      <select className={selectClass} value={props.type} onChange={(e) => props.onType(e.target.value as FundType | "all")}>
        {TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t === "all" ? "全部类型" : t}
          </option>
        ))}
      </select>

      {/* 排序 */}
      <select className={selectClass} value={props.sort} onChange={(e) => props.onSort(e.target.value as SortKey)}>
        {SORT_OPTIONS.map((s) => (
          <option key={s.value} value={s.value}>
            {s.label}
          </option>
        ))}
      </select>

      {/* 只看自选 */}
      <button
        type="button"
        onClick={() => props.onOnlyWatch(!props.onlyWatch)}
        className={cn(
          "rounded-lg border px-3 py-2 text-sm transition-colors",
          props.onlyWatch
            ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
            : "border-zinc-200 bg-white text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        )}
      >
        {props.onlyWatch ? "★ 只看自选" : "☆ 只看自选"}
        {props.watchCount > 0 && <span className="ml-1 text-xs opacity-70">({props.watchCount})</span>}
      </button>

      <span className="text-xs text-zinc-400 sm:ml-auto">共 {props.resultCount} 只</span>
    </div>
  );
}
