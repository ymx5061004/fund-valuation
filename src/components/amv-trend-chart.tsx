"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";
import type { AmvPoint } from "@/lib/types";

const TEXT = "#71717a"; // zinc-500，浅色/深色背景下都清晰
const SPLIT = "rgba(113,113,122,0.18)";

/** 活跃市值双轴走势图（活跃市值亿元 + 参考指数点位）。日/周/月视图共用，points 已按频率取好。
 *  indexLabel：参考指数系列名（大盘板块传「沪指点位」，单指数面板用默认「指数点位」，勿硬编码沪指）。 */
export function AmvTrendChart({
  points,
  indexLabel = "指数点位",
  className = "h-[260px] w-full sm:h-[300px]",
}: {
  points: AmvPoint[];
  indexLabel?: string;
  className?: string;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // 上一次绘制的数据签名：轮询同值时跳过 setOption，避免全量重绘复位用户缩放/重播动画
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
    // 数据内容签名：点数 + 首末日期 + 末点值。indexLabel 并入以便换标签时也刷新
    const last = points[points.length - 1];
    const sig = points.length
      ? `${indexLabel}|${points.length}|${points[0].date}|${last.date}|${last.amv}|${last.close}`
      : `${indexLabel}|0`;
    if (sig === sigRef.current) return; // 同值（如 30s 轮询拿到一样的收盘序列）→ 不重绘，保留缩放
    sigRef.current = sig;

    const dates = points.map((p) => p.date);
    const amvYi = points.map((p) => Number((p.amv / 1e8).toFixed(1)));
    const closes = points.map((p) => p.close);

    chart.setOption(
      {
        animationDuration: 400,
        grid: { left: 8, right: 8, top: 36, bottom: 52, containLabel: true },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "line" },
          formatter: (params: { seriesName: string; axisValue: string; data: number }[]) => {
            const lines = params.map((p) =>
              p.seriesName === "活跃市值"
                ? `活跃市值：${p.data >= 10000 ? `${(p.data / 10000).toFixed(2)}万亿` : `${p.data.toFixed(0)}亿`}`
                : `${indexLabel}：${p.data.toFixed(2)}`,
            );
            return [params[0]?.axisValue, ...lines].join("<br/>");
          },
        },
        legend: { data: ["活跃市值", indexLabel], top: 4, textStyle: { color: TEXT }, itemWidth: 18, itemHeight: 10 },
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
            axisLabel: { color: TEXT, formatter: (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}万亿` : `${v}亿`) },
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
            name: indexLabel,
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
  }, [points, indexLabel]);

  return <div ref={elRef} className={className} />;
}
