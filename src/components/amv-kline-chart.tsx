"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { AmvCandle } from "@/lib/types";

const RED = "#e11d48"; // 涨（A 股红涨绿跌，与 kline-chart 一致）
const GREEN = "#16a34a"; // 跌
const AXIS = "#a1a1aa";
const SPLIT = "rgba(113,113,122,0.12)";
const MA_COLORS: [string, string, string] = ["#f59e0b", "#8b5cf6", "#2563eb"]; // MA5/10/20

/** 亿元数值格式化（成交额副图用）：≥万亿显示 x.xx万亿，否则 x亿 */
function fmtYi(v: number): string {
  return v >= 10000 ? `${(v / 10000).toFixed(2)}万亿` : `${v.toFixed(0)}亿`;
}

/** 指数点数格式化（主图用）：坐标轴紧凑（xx.x万），tooltip 保留 1 位小数原值 */
function fmtPts(v: number): string {
  return v.toFixed(1);
}

function movingAverage(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    return Number((sum / period).toFixed(1));
  });
}

/** 活跃市值蜡烛图（主图 K 线 + MA5/10/20 + 成交额副图，红涨绿跌）。
 *  数据签名门控 setOption：轮询拿到同值不重绘，保留用户缩放。 */
export function AmvKlineChart({ data, className = "h-[340px] w-full sm:h-[400px]" }: { data: AmvCandle[]; className?: string }) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const sigRef = useRef("");

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
      sigRef.current = "";
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const last = data[data.length - 1];
    const sig = data.length ? `${data.length}|${data[0].date}|${last.date}|${last.close}|${last.amount}` : "0";
    if (sig === sigRef.current) return;
    sigRef.current = sig;

    const dates = data.map((d) => d.date);
    // 主图＝活跃筹码市值指数（点数，已定标）；副图＝成交额（亿元）
    const candles = data.map((d) => [d.open, d.close, d.low, d.high].map((v) => Number(v.toFixed(1))));
    const closes = data.map((d) => d.close);
    // 成交额缺失（如东财被封走新浪备源，新浪日K无额字段）→ 收起副图，主图占满，不画全零柱误导
    const hasAmount = data.some((d) => d.amount > 0);
    const vols = data.map((d) => ({
      value: d.amount / 1e8,
      itemStyle: { color: d.close >= d.open ? RED : GREEN, opacity: 0.65 },
    }));

    const mainXAxis = {
      type: "category" as const,
      gridIndex: 0,
      data: dates,
      boundaryGap: true,
      axisLine: { lineStyle: { color: "rgba(113,113,122,0.2)" } },
    };
    chart.setOption(
      {
        animationDuration: 300,
        // 主图（+ 有成交额时的副图）grid，共享 x 轴缩放。
        // ⚠️ 不能用 containLabel：两 grid 会按各自 y 轴标签宽度收缩，主副图绘图区错位（柱不在蜡烛正下方、
        // 十字线不共线）——固定相同 left 保证两 plot 区完全重合（标签用紧凑格式控制在 left 宽度内）
        grid: hasAmount
          ? [
              { left: 66, right: 8, top: 28, height: "56%" },
              { left: 66, right: 8, top: "74%", height: "14%" },
            ]
          : [{ left: 66, right: 8, top: 28, height: "74%" }],
        ...(hasAmount ? { axisPointer: { link: [{ xAxisIndex: [0, 1] }] } } : {}),
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross" },
          formatter: (params: { dataIndex: number }[]) => {
            const i = params[0]?.dataIndex;
            const d = data[i];
            if (!d) return "";
            const prevClose = i > 0 ? data[i - 1].close : d.open;
            const pct = prevClose > 0 ? ((d.close - prevClose) / prevClose) * 100 : 0;
            const pctColor = pct >= 0 ? RED : GREEN;
            return (
              `${d.date}<br/>` +
              `开 ${fmtPts(d.open)}　收 ${fmtPts(d.close)}<br/>` +
              `高 ${fmtPts(d.high)}　低 ${fmtPts(d.low)}<br/>` +
              `涨跌 <span style="color:${pctColor}">${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%</span>` +
              (d.amount > 0 ? `　额 ${fmtYi(d.amount / 1e8)}` : "")
            );
          },
        },
        legend: {
          data: ["MA5", "MA10", "MA20"],
          top: 2,
          textStyle: { color: AXIS },
          itemWidth: 14,
          itemHeight: 8,
        },
        xAxis: hasAmount
          ? [
              { ...mainXAxis, axisLabel: { show: false }, axisTick: { show: false } },
              {
                type: "category",
                gridIndex: 1,
                data: dates,
                boundaryGap: true,
                axisLine: { lineStyle: { color: "rgba(113,113,122,0.2)" } },
                axisLabel: { color: AXIS, hideOverlap: true },
              },
            ]
          : [{ ...mainXAxis, axisLabel: { color: AXIS, hideOverlap: true } }],
        yAxis: [
          {
            type: "value",
            gridIndex: 0,
            scale: true,
            splitLine: { lineStyle: { color: SPLIT } },
            // 紧凑格式：指数点数 ≥1万 显示 xx.x万，标签须放进固定 left=66 内，两 grid 才能对齐
            axisLabel: { color: AXIS, formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万` : `${Math.round(v)}`) },
          },
          ...(hasAmount
            ? [
                {
                  type: "value" as const,
                  gridIndex: 1,
                  // 成交额柱必须 0 基线（不设 scale）：非 0 起点会让放量/缩量的目视比例失真、小量日缩到不可见
                  splitNumber: 2,
                  splitLine: { show: false },
                  axisLabel: { color: AXIS, formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万亿` : `${Math.round(v)}亿`) },
                },
              ]
            : []),
        ],
        dataZoom: [
          { type: "inside", xAxisIndex: hasAmount ? [0, 1] : [0], start: 0, end: 100 },
          { type: "slider", xAxisIndex: hasAmount ? [0, 1] : [0], start: 0, end: 100, height: 16, bottom: 6 },
        ],
        series: [
          {
            name: "活跃市值",
            type: "candlestick",
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: candles,
            itemStyle: { color: RED, color0: GREEN, borderColor: RED, borderColor0: GREEN },
          },
          ...([5, 10, 20] as const).map((p, i) => ({
            name: `MA${p}`,
            type: "line" as const,
            xAxisIndex: 0,
            yAxisIndex: 0,
            data: movingAverage(closes, p),
            showSymbol: false,
            smooth: true,
            lineStyle: { width: 1, color: MA_COLORS[i] },
          })),
          ...(hasAmount
            ? [
                {
                  name: "成交额",
                  type: "bar" as const,
                  xAxisIndex: 1,
                  yAxisIndex: 1,
                  data: vols,
                },
              ]
            : []),
        ],
      },
      true,
    );
  }, [data]);

  return <div ref={elRef} className={className} />;
}
