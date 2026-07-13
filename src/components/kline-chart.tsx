"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { KlineCandle } from "@/lib/types";

const RED = "#e11d48"; // 涨
const GREEN = "#16a34a"; // 跌
const AXIS = "#a1a1aa";

export function KlineChart({ data }: { data: KlineCandle[] }) {
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
    const dates = data.map((d) => d.date);
    // ECharts 蜡烛：[开, 收, 低, 高]
    const candles = data.map((d) => [d.open, d.close, d.low, d.high]);

    chart.setOption(
      {
        animationDuration: 300,
        grid: { left: 8, right: 8, top: 16, bottom: 40, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "cross" },
          // 自定义中文 tooltip：ECharts 蜡烛图默认的 open/close/lowest/highest 是硬编码英文
          formatter: (params: { dataIndex: number }[]) => {
            const i = params[0]?.dataIndex;
            const d = data[i];
            if (!d) return "";
            const prevClose = i > 0 ? data[i - 1].close : d.open;
            const pct = prevClose > 0 ? ((d.close - prevClose) / prevClose) * 100 : 0;
            const pctColor = pct >= 0 ? RED : GREEN;
            return (
              `${d.date}<br/>` +
              `开 ${d.open.toFixed(2)}　收 ${d.close.toFixed(2)}<br/>` +
              `高 ${d.high.toFixed(2)}　低 ${d.low.toFixed(2)}<br/>` +
              `涨跌幅 <span style="color:${pctColor}">${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%</span>`
            );
          },
        },
        xAxis: {
          type: "category",
          data: dates,
          boundaryGap: true,
          axisLine: { lineStyle: { color: "rgba(113,113,122,0.2)" } },
          axisLabel: { color: AXIS, hideOverlap: true },
        },
        yAxis: {
          type: "value",
          scale: true,
          splitLine: { lineStyle: { color: "rgba(113,113,122,0.12)" } },
          axisLabel: { color: AXIS },
        },
        dataZoom: [
          { type: "inside", start: 60, end: 100 },
          { type: "slider", start: 60, end: 100, height: 16, bottom: 14 },
        ],
        series: [
          {
            type: "candlestick",
            data: candles,
            itemStyle: { color: RED, color0: GREEN, borderColor: RED, borderColor0: GREEN },
          },
        ],
      },
      true,
    );
  }, [data]);

  return <div ref={elRef} className="h-[280px] w-full" />;
}
