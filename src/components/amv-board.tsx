"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AmvBoard as AmvBoardData, AmvCandle } from "@/lib/types";
import { aggregateAmvCandles, formatAmountCN } from "@/lib/amv";
import { isAShareTradingTime, usePolling } from "@/lib/use-polling";
import { changeColor, cn } from "@/lib/utils";
import { SignalBadge } from "@/components/ui/badge";
import { AmvKlineChart } from "@/components/amv-kline-chart";
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

  // 选中频率的蜡烛：服务端给日线真 OHLC 蜡烛，周/月K客户端聚合（残缺首组已在聚合内丢弃）。
  // useMemo 依赖 [d, tab]：轮询拿到同值时图表由 AmvKlineChart 的签名门控跳过重绘（不复位缩放）
  const candles: AmvCandle[] = useMemo(() => {
    if (!d) return [];
    if (tab === "日") return d.candles.slice(-160);
    if (tab === "周") return aggregateAmvCandles(d.candles, "week").slice(-120);
    return aggregateAmvCandles(d.candles, "month");
  }, [d, tab]);

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <header className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => router.back()} aria-label="返回" className="text-2xl leading-none text-zinc-500">
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">活跃市值 0AMV</div>
          <div className="text-xs text-zinc-400">活跃筹码市值指数 · 公开数据估算</div>
        </div>
        <span className="w-5" />
      </header>

      {!d ? (
        <div className="px-4 py-20 text-center text-sm text-zinc-400">{loading ? "加载中…" : "暂无数据（上游可能限流，稍后自动重试）"}</div>
      ) : (
        <>
          <section className="px-4 pb-3">
            <div className={cn("text-3xl font-bold tabular-nums", changeColor(d.change))}>{d.value.toFixed(1)}</div>
            <div className={cn("mt-0.5 flex items-center gap-2 text-sm font-medium tabular-nums", changeColor(d.change))}>
              <span>
                {d.change >= 0 ? "+" : ""}
                {d.change.toFixed(1)}
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
              {d.turnover10 > 0 && <Stat label="10日额" value={formatAmountCN(d.turnover10)} />}
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
            {candles.length > 0 ? (
              <>
                <AmvKlineChart data={candles} />
                <p className="px-2 pt-1 text-[11px] text-zinc-400">
                  蜡烛＝活跃筹码市值指数：近10日两市成交量（活跃筹码代理）×沪指当日
                  开/高/低/收，定标为指数点数（非金额）
                  {candles.some((c) => c.amount > 0) ? " · 副图为两市成交额" : " · 备源数据无成交额，副图暂略"}
                </p>
              </>
            ) : (
              <div className="flex h-[340px] items-center justify-center text-sm text-zinc-400">暂无走势数据</div>
            )}
          </section>

          <section className="flex flex-col gap-4 px-4">
            <AmvVerdict analysis={d.analysis} estimateNote />
          </section>

          <p className="px-4 pt-3 text-center text-[11px] text-zinc-400">
            数据来自东方财富/新浪公开行情（量价合成估算），交易时段每 30 秒刷新 · 仅供参考
          </p>
        </>
      )}
    </div>
  );
}
