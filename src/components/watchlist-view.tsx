"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { FundMeta, QuoteMetrics } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";
import { changeColor, cn, formatNav, formatPct } from "@/lib/utils";
import { FundSearch } from "@/components/fund-search";

function starColor(chg: number | undefined): string {
  if (chg == null) return "text-zinc-300 dark:text-zinc-600";
  if (chg > 0) return "text-red-500";
  if (chg < 0) return "text-green-500";
  return "text-zinc-400";
}

/** 涨跌幅单元格（null 显示 --） */
function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-zinc-300 dark:text-zinc-600">--</span>;
  return <span className={changeColor(v)}>{formatPct(v)}</span>;
}

const METRIC_HEAD = "px-3 py-2 text-right text-xs font-normal text-zinc-400 whitespace-nowrap";
const METRIC_CELL = "px-3 py-3.5 text-right text-sm tabular-nums whitespace-nowrap";

export function WatchlistView() {
  const router = useRouter();
  const [watch, setWatch] = useLocalStorage<string[]>("fv.watchlist", []);
  const [metrics, setMetrics] = useState<Record<string, QuoteMetrics>>({});
  const [sortDesc, setSortDesc] = useState(true);

  const codesParam = useMemo(() => watch.join(","), [watch]);

  // 多指标：开页/自选变动时拉取，并每 30s 刷新（当日涨幅在盘中随估值更新）
  useEffect(() => {
    if (!codesParam) {
      setMetrics({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/quotes?codes=${codesParam}`);
        if (!r.ok) return;
        const j = (await r.json()) as { data: QuoteMetrics[] };
        if (cancelled) return;
        const map: Record<string, QuoteMetrics> = {};
        for (const m of j.data) map[m.code] = m;
        setMetrics(map);
      } catch {
        // 忽略
      }
    };
    void load();
    const id = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [codesParam]);

  const add = (m: FundMeta) => setWatch((prev) => (prev.includes(m.code) ? prev : [...prev, m.code]));
  const remove = (code: string) => setWatch((prev) => prev.filter((c) => c !== code));

  const rows = useMemo(() => {
    const list = watch.map((code) => ({ code, m: metrics[code] as QuoteMetrics | undefined }));
    list.sort((a, b) => {
      const av = a.m?.dayChangePct ?? -Infinity;
      const bv = b.m?.dayChangePct ?? -Infinity;
      return sortDesc ? bv - av : av - bv;
    });
    return list;
  }, [watch, metrics, sortDesc]);

  return (
    <div className="mx-auto max-w-3xl">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-sm">
            🐱
          </div>
          <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">基金</span>
        </div>
        <span className="text-sm text-zinc-400">自选 {watch.length} 只</span>
      </header>

      {/* 搜索添加 */}
      <div className="px-4">
        <FundSearch onAdd={add} adding={false} />
      </div>

      {watch.length === 0 ? (
        <div className="flex flex-col items-center px-4 pt-20 text-center">
          <div className="text-sm text-zinc-400">暂无自选</div>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-zinc-400">
            在上方搜索基金加入自选，或到「行情」页给基金点 ★ 收藏。
          </p>
        </div>
      ) : (
        <section className="mt-3">
          {/* 横向滚动：名称列固定，指标列右滑查看 */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 border-b border-r border-zinc-100 bg-white px-4 py-2 text-left text-xs font-normal text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900">
                    基金名称
                  </th>
                  <th className={cn(METRIC_HEAD, "border-b border-zinc-100 dark:border-zinc-800")}>
                    <button type="button" onClick={() => setSortDesc((v) => !v)} className="inline-flex items-center gap-0.5">
                      当日涨幅 <span className="text-[10px]">{sortDesc ? "▼" : "▲"}</span>
                    </button>
                  </th>
                  {["盘中估值", "本周", "本月", "今年", "近一年"].map((h) => (
                    <th key={h} className={cn(METRIC_HEAD, "border-b border-zinc-100 dark:border-zinc-800")}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ code, m }) => (
                  <tr
                    key={code}
                    onClick={() => router.push(`/fund/${code}`)}
                    className="cursor-pointer border-b border-zinc-50 transition-colors hover:bg-zinc-50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/40"
                  >
                    {/* 名称列：固定 */}
                    <td className="sticky left-0 z-10 border-r border-zinc-100 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            remove(code);
                          }}
                          aria-label="取消自选"
                          className={cn("shrink-0 text-base leading-none", starColor(m?.dayChangePct))}
                        >
                          ★
                        </button>
                        <div className="min-w-0">
                          <div className="max-w-[150px] truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                            {m?.name ?? code}
                          </div>
                          <div className="mt-0.5 text-xs text-zinc-400">{code}</div>
                        </div>
                      </div>
                    </td>
                    <td className={METRIC_CELL}>
                      <div className={cn("flex items-center justify-end gap-0.5 font-semibold", changeColor(m?.dayChangePct ?? 0))}>
                        {m ? formatPct(m.dayChangePct) : "--"}
                        {m?.dayEstimated && (
                          <span className="rounded bg-zinc-100 px-1 text-[9px] font-normal text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300">
                            估
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-xs font-normal tabular-nums text-zinc-400">{m ? formatNav(m.dayNav) : ""}</div>
                    </td>
                    <td className={METRIC_CELL}>
                      <div className={cn("font-semibold", changeColor(m?.estimateChangePct ?? 0))}>
                        {m ? formatPct(m.estimateChangePct) : "--"}
                      </div>
                      <div className="mt-0.5 text-xs font-normal tabular-nums text-zinc-400">{m ? formatNav(m.estimateNav) : ""}</div>
                    </td>
                    <td className={cn(METRIC_CELL, "font-medium")}>
                      <Pct v={m?.weekPct} />
                    </td>
                    <td className={cn(METRIC_CELL, "font-medium")}>
                      <Pct v={m?.monthPct} />
                    </td>
                    <td className={cn(METRIC_CELL, "font-medium")}>
                      <Pct v={m?.ytdPct} />
                    </td>
                    <td className={cn(METRIC_CELL, "font-medium")}>
                      <Pct v={m?.yearPct} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-center text-[11px] text-zinc-400">
            左右滑动查看更多指标 · 当日涨幅=确认/盘中涨幅，盘中估值=实时估算(每30s刷新)，周/月/今年/近一年按历史净值 · 仅供参考
          </p>
        </section>
      )}
    </div>
  );
}
