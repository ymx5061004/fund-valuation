"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface Props {
  trend: { time: string; price: number }[];
  prevClose: number;
  up: boolean;
}

export function IndexTrendChart({ trend, prevClose, up }: Props) {
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
    const color = up ? "#e11d48" : "#16a34a"; // 红涨绿跌
    const times = trend.map((p) => p.time);
    const prices = trend.map((p) => p.price);

    chart.setOption(
      {
        animationDuration: 300,
        grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
        tooltip: {
          trigger: "axis",
          formatter: (params: { axisValue: string; data: number }[]) => {
            const p = params[0];
            const pct = prevClose > 0 ? ((p.data - prevClose) / prevClose) * 100 : 0;
            return `${p.axisValue}<br/>点位 ${p.data?.toFixed(2)}　${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
          },
        },
        xAxis: {
          type: "category",
          data: times,
          boundaryGap: false,
          axisLine: { lineStyle: { color: "rgba(113,113,122,0.2)" } },
          axisLabel: {
            color: "#a1a1aa",
            interval: (i: number) => i === 0 || i === Math.floor(times.length / 2) || i === times.length - 1,
          },
        },
        yAxis: {
          type: "value",
          scale: true,
          splitLine: { lineStyle: { color: "rgba(113,113,122,0.12)" } },
          axisLabel: {
            color: "#a1a1aa",
            formatter: (v: number) => {
              const pct = prevClose > 0 ? ((v - prevClose) / prevClose) * 100 : 0;
              return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
            },
          },
        },
        series: [
          {
            type: "line",
            data: prices,
            showSymbol: false,
            smooth: false,
            lineStyle: { width: 1.5, color },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: up ? "rgba(225,29,72,0.18)" : "rgba(22,163,74,0.18)" },
                { offset: 1, color: "rgba(0,0,0,0.01)" },
              ]),
            },
            markLine: {
              symbol: "none",
              silent: true,
              lineStyle: { color: "#a1a1aa", type: "dashed", width: 1 },
              data: [{ yAxis: prevClose }],
              label: { show: false },
            },
          },
        ],
      },
      true,
    );
  }, [trend, prevClose, up]);

  return <div ref={elRef} className="h-[260px] w-full" />;
}
