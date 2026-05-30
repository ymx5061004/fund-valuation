"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { Fund } from "@/lib/types";

/** 计算移动平均序列（不足 period 的位置返回 null，ECharts 会自动断开） */
function movingAverage(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += values[j];
    return Number((sum / period).toFixed(4));
  });
}

const TEXT = "#71717a"; // zinc-500，浅色/深色背景下都清晰
const SPLIT = "rgba(113,113,122,0.18)";

export function NavChart({ fund }: { fund: Fund }) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  // 初始化 + 跟随容器尺寸自适应（响应式关键）
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

  // 数据变化时更新图表
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const dates = fund.navHistory.map((p) => p.date);
    const navs = fund.navHistory.map((p) => p.nav);
    const ma5 = movingAverage(navs, 5);
    const ma20 = movingAverage(navs, 20);

    chart.setOption(
      {
        animationDuration: 400,
        grid: { left: 8, right: 12, top: 36, bottom: 56, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line" },
        },
        legend: {
          data: ["净值", "MA5", "MA20"],
          top: 4,
          textStyle: { color: TEXT },
          itemWidth: 18,
          itemHeight: 10,
        },
        xAxis: {
          type: "category",
          data: dates,
          boundaryGap: false,
          axisLine: { lineStyle: { color: SPLIT } },
          axisLabel: { color: TEXT, hideOverlap: true },
        },
        yAxis: {
          type: "value",
          scale: true,
          splitLine: { lineStyle: { color: SPLIT } },
          axisLabel: { color: TEXT },
        },
        dataZoom: [
          { type: "inside", start: 55, end: 100 },
          { type: "slider", start: 55, end: 100, height: 18, bottom: 16 },
        ],
        series: [
          {
            name: "净值",
            type: "line",
            data: navs,
            showSymbol: false,
            smooth: true,
            lineStyle: { width: 2, color: "#2563eb" },
            areaStyle: {
              color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                { offset: 0, color: "rgba(37,99,235,0.20)" },
                { offset: 1, color: "rgba(37,99,235,0.01)" },
              ]),
            },
          },
          { name: "MA5", type: "line", data: ma5, showSymbol: false, smooth: true, lineStyle: { width: 1, color: "#f59e0b" } },
          { name: "MA20", type: "line", data: ma20, showSymbol: false, smooth: true, lineStyle: { width: 1, color: "#8b5cf6" } },
        ],
      },
      true,
    );
  }, [fund]);

  return <div ref={elRef} className="h-[300px] w-full sm:h-[360px]" />;
}
