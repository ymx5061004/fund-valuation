"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AmvBoard as AmvBoardData, AmvPoint } from "@/lib/types";
import { AMV_WINDOW, formatAmountCN, resampleAmv } from "@/lib/amv";
import { isAShareTradingTime, usePolling } from "@/lib/use-polling";
import { changeColor, cn } from "@/lib/utils";
import { SignalBadge } from "@/components/ui/badge";
import { AmvTrendChart } from "@/components/amv-trend-chart";
import { AmvVerdict } from "@/components/amv-verdict";

const TABS = [
  { key: "日", label: "日线" },
  { key: "周", label: "周线" },
  { key: "月", label: "月线" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-zinc-400">{label}</span>
      <span className={cn("tabular-nums", valueClass ?? "text-zinc-700 dark:text-zinc-300")}>{value}</span>
    </div>
  );
}

/** 活跃市值 0AMV 独立板块（参考指南针，公开成交额估算版）：大盘活跃资金 = 两市成交额10日滚动合计。
 *  值+涨跌 / 日周月走势 / 今日实时成交额 / 涨跌家数 / 研判。交易时段 30s 轮询，隐藏或非交易时段降频。 */
export function AmvBoard() {
  const router = useRouter();
  const [d, setD] = useState<AmvBoardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("日");
  const reqIdRef = useRef(0);
  const failRef = useRef(0);

  const pollActive = useCallback(() => failRef.current < 3 && isAShareTradingTime(), []);

  usePolling(
    async () => {
      const reqId = ++reqIdRef.current;
      try {
        const r = await fetch("/api/amv");
        if (r.ok) {
          const j = (await r.json()) as { data: AmvBoardData | null };
          if (reqId !== reqIdRef.current) return;
          if (j.data) {
            failRef.current = 0;
            setD(j.data);
          } else {
            failRef.current++;
          }
        } else {
          failRef.current++;
        }
      } catch {
        failRef.current++;
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    { activeMs: 30000, idleMs: 300000, isActive: pollActive, key: "amv" },
  );

  // 选中频率的走势点：日线取近 160 交易日，周/月重采样后取尾段。
  // useMemo 依赖 [d, tab]：轮询拿到同值时图表由 AmvTrendChart 的签名门控跳过重绘（不复位缩放）
  const chartPoints: AmvPoint[] = useMemo(() => {
    if (!d) return [];
    if (tab === "日") return d.points.slice(-160);
    if (tab === "周") return resampleAmv(d.points, "week").slice(-120);
    return resampleAmv(d.points, "month");
  }, [d, tab]);

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <header className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => router.back()} aria-label="返回" className="text-2xl leading-none text-zinc-500">
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">活跃市值 0AMV</div>
          <div className="text-xs text-zinc-400">大盘活跃资金 · 成交额估算</div>
        </div>
        <span className="w-5" />
      </header>

      {!d ? (
        <div className="px-4 py-20 text-center text-sm text-zinc-400">{loading ? "加载中…" : "暂无数据（上游可能限流，稍后自动重试）"}</div>
      ) : (
        <>
          <section className="px-4 pb-3">
            <div className={cn("text-3xl font-bold tabular-nums", changeColor(d.change))}>{formatAmountCN(d.value)}</div>
            <div className={cn("mt-0.5 flex items-center gap-2 text-sm font-medium tabular-nums", changeColor(d.change))}>
              <span>
                {d.change >= 0 ? "+" : "-"}
                {formatAmountCN(Math.abs(d.change))}
              </span>
              <span>{fmtPct(d.changePct)}</span>
              <SignalBadge signal={d.analysis.signal} className="ml-1" />
              {d.analysis.state && <span className="text-zinc-500 dark:text-zinc-400">{d.analysis.state}</span>}
            </div>
            <div className="mt-1 text-xs text-zinc-400">
              {d.tradingNow ? "交易中" : "已收盘"} · {d.coverage === "both" ? "沪深两市" : "仅沪市（深市暂缺）"} · 截至 {d.date} 收盘
            </div>

            <div className="mt-3 grid grid-cols-3 gap-x-5 gap-y-2 text-sm">
              <Stat label="近5日" value={fmtPct(d.analysis.trend5Pct)} valueClass={changeColor(d.analysis.trend5Pct)} />
              <Stat label="近20日" value={fmtPct(d.analysis.amv20Pct)} valueClass={changeColor(d.analysis.amv20Pct)} />
              <Stat label="沪指20日" value={fmtPct(d.analysis.index20Pct)} valueClass={changeColor(d.analysis.index20Pct)} />
              {d.todayAmount != null && <Stat label="今日额" value={formatAmountCN(d.todayAmount)} />}
              {d.breadth && (
                <>
                  <Stat label="涨" value={String(d.breadth.up)} valueClass="text-red-600 dark:text-red-500" />
                  <Stat label="跌" value={String(d.breadth.down)} valueClass="text-green-600 dark:text-green-500" />
                </>
              )}
            </div>
          </section>

          <div className="flex border-y border-zinc-100 dark:border-zinc-800">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 py-2.5 text-sm transition-colors",
                  tab === t.key
                    ? "border-b-2 border-blue-500 font-medium text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-400",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <section className="px-2 py-3">
            {chartPoints.length > 0 ? (
              <AmvTrendChart points={chartPoints} indexLabel="沪指点位" />
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-zinc-400">暂无走势数据</div>
            )}
          </section>

          <section className="flex flex-col gap-4 px-4">
            <AmvVerdict analysis={d.analysis} estimateNote />
          </section>

          <p className="px-4 pt-3 text-center text-[11px] text-zinc-400">
            数据来自东方财富两市成交额估算，交易时段每 30 秒刷新 · 仅供参考
          </p>
        </>
      )}
    </div>
  );
}
