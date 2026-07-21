"use client";

import { useEffect, useMemo, useState } from "react";
import type { KlineCandle } from "@/lib/types";
import { analyzeAmv, AMV_WINDOW, computeAmvSeries, dropUnfinishedToday, formatAmountCN } from "@/lib/amv";
import { changeColor, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalBadge } from "@/components/ui/badge";
import { AmvTrendChart } from "@/components/amv-trend-chart";
import { AmvVerdict } from "@/components/amv-verdict";

function Indicator({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", valueClass ?? "text-zinc-800 dark:text-zinc-200")}>
        {value}
      </div>
    </div>
  );
}

/** 涨跌幅文案（配色用 utils.changeColor 的红涨绿跌） */
function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/** 活跃市值(0AMV)面板：单个指数视角——近 N 日成交额滚动合计近似活跃资金体量，与指数走势对比研判。
 *  自取日 K（type=d），指数无成交额数据时显示空态。大盘独立板块见 /amv（AmvBoard）。 */
export function AmvPanel({ secid }: { secid: string }) {
  const [candles, setCandles] = useState<KlineCandle[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCandles(null);
    (async () => {
      try {
        const r = await fetch(`/api/kline?secid=${encodeURIComponent(secid)}&type=d`);
        if (!r.ok) {
          if (!cancelled) setCandles([]);
          return;
        }
        const j = (await r.json()) as { kind: string; candle?: KlineCandle[] };
        if (!cancelled) setCandles(j.kind === "candle" ? (j.candle ?? []) : []);
      } catch {
        if (!cancelled) setCandles([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secid]);

  const { points, analysis } = useMemo(() => {
    if (!candles) return { points: [], analysis: null };
    // ① 盘中剔除未收盘的当日 K 线（各市场按收盘时间，成交额不完整会让末点失真下坠）
    // ② 再截近约 8 个月交易日：东财 kline 在 beg=0 时忽略 lmt 返回 1990 年至今全量(~8600 点)，
    //    不截会把默认视图拉成 36 年、近期趋势被压平；160 根足够背离窗(60)+同步窗(20)+图表可读
    const cs = dropUnfinishedToday(candles, secid).slice(-160);
    const pts = computeAmvSeries(cs);
    return { points: pts, analysis: analyzeAmv(pts) };
  }, [candles, secid]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>活跃市值 0AMV</CardTitle>
        {analysis && <SignalBadge signal={analysis.signal} />}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {candles === null ? (
          <div className="flex h-40 items-center justify-center text-sm text-zinc-400">加载中…</div>
        ) : !analysis ? (
          <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-zinc-400">
            该指数暂无成交额数据或样本不足，无法计算活跃市值
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-between">
              <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{analysis.state}</span>
              <span className="text-sm text-zinc-400">近{AMV_WINDOW}日活跃资金</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Indicator label="当前活跃市值" value={formatAmountCN(analysis.amv)} />
              <Indicator label="活跃市值 · 近5日" value={fmtPct(analysis.trend5Pct)} valueClass={changeColor(analysis.trend5Pct)} />
              <Indicator label="指数 · 近20日" value={fmtPct(analysis.index20Pct)} valueClass={changeColor(analysis.index20Pct)} />
              <Indicator label="活跃市值 · 近20日" value={fmtPct(analysis.amv20Pct)} valueClass={changeColor(analysis.amv20Pct)} />
            </div>

            <AmvTrendChart points={points} />

            <AmvVerdict analysis={analysis} />
          </>
        )}
      </CardContent>
    </Card>
  );
}
