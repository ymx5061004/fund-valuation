"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import * as echarts from "echarts";
import type { KlineCandle, Signal } from "@/lib/types";
import { analyzeAmv, AMV_WINDOW, computeAmvSeries, dropUnfinishedToday, formatAmountCN } from "@/lib/amv";
import { changeColor, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalBadge } from "@/components/ui/badge";

const TEXT = "#71717a"; // zinc-500，浅色/深色背景下都清晰
const SPLIT = "rgba(113,113,122,0.18)";
// 红涨绿跌：多=红 空=绿（与 SignalBadge 一致）
const DOT: Record<Signal, string> = { bullish: "bg-red-500", bearish: "bg-green-500", neutral: "bg-zinc-400" };

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

function AmvChart({ dates, amvYi, closes }: { dates: string[]; amvYi: number[]; closes: number[] }) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const chart = echarts.init(el);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setOption(
      {
        animationDuration: 400,
        grid: { left: 8, right: 8, top: 36, bottom: 52, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line" },
          valueFormatter: undefined,
          formatter: (params: { seriesName: string; axisValue: string; data: number }[]) => {
            const lines = params.map((p) =>
              p.seriesName === "活跃市值"
                ? `活跃市值：${p.data >= 10000 ? `${(p.data / 10000).toFixed(2)}万亿` : `${p.data.toFixed(0)}亿`}`
                : `指数点位：${p.data.toFixed(2)}`,
            );
            return [params[0]?.axisValue, ...lines].join("<br/>");
          },
        },
        legend: { data: ["活跃市值", "指数点位"], top: 4, textStyle: { color: TEXT }, itemWidth: 18, itemHeight: 10 },
        xAxis: {
          type: "category",
          data: dates,
          boundaryGap: false,
          axisLine: { lineStyle: { color: SPLIT } },
          axisLabel: { color: TEXT, hideOverlap: true },
        },
        yAxis: [
          {
            type: "value",
            scale: true,
            splitLine: { lineStyle: { color: SPLIT } },
            axisLabel: {
              color: TEXT,
              formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万亿` : `${v}亿`),
            },
          },
          { type: "value", scale: true, splitLine: { show: false }, axisLabel: { color: TEXT } },
        ],
        dataZoom: [
          { type: "inside", start: 0, end: 100 },
          { type: "slider", start: 0, end: 100, height: 18, bottom: 14 },
        ],
        series: [
          {
            name: "活跃市值",
            type: "line",
            yAxisIndex: 0,
            data: amvYi,
            showSymbol: false,
            smooth: true,
            lineStyle: { width: 2, color: "#f59e0b" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(245,158,11,0.20)" },
                { offset: 1, color: "rgba(245,158,11,0.01)" },
              ]),
            },
          },
          {
            name: "指数点位",
            type: "line",
            yAxisIndex: 1,
            data: closes,
            showSymbol: false,
            smooth: true,
            lineStyle: { width: 1.5, color: "#2563eb" },
          },
        ],
      },
      true,
    );
  }, [dates, amvYi, closes]);

  return <div ref={elRef} className="h-[260px] w-full sm:h-[300px]" />;
}

/** 活跃市值(0AMV)面板：近 N 日成交额滚动合计近似活跃资金体量，与指数走势对比研判真假涨跌与顶底背离。
 *  自取日 K（type=d），指数无成交额数据时显示空态。 */
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

  const chartData = useMemo(
    () => ({
      dates: points.map((p) => p.date),
      amvYi: points.map((p) => Number((p.amv / 1e8).toFixed(1))),
      closes: points.map((p) => p.close),
    }),
    [points],
  );

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

            <AmvChart dates={chartData.dates} amvYi={chartData.amvYi} closes={chartData.closes} />

            <div>
              <div className="mb-1.5 text-xs font-medium text-zinc-500">判断依据</div>
              <ul className="space-y-1.5">
                {analysis.reasons.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                    <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[analysis.signal])} />
                    <span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
              口诀：活筹涨，有钱赚，大胆持股；活筹跌，资金跑，降低仓位；指数新高活筹弱，准备离场；指数新低活筹稳，逢低布局。
            </div>

            <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-500">
              活跃市值以近{AMV_WINDOW}日成交额滚动合计近似「参与交易的活跃资金」，为大盘趋势先行参考——请结合 K
              线、筹码与板块热度综合研判，勿单独作为买卖依据；对筹码长期锁定的长线品种参考意义有限。
              <strong>不构成投资建议</strong>，市场有风险。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
