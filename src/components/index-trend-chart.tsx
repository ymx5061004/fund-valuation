"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts";

interface Props {
  trend: { time: string; price: number }[];
  prevClose: number;
  up: boolean;
  /** A 股当日分时：固定 9:30-15:00 全天 241 格时间轴，盘中右侧留白表示未走完的时段。
   *  五日/境外指数保持按实际数据点生成轴。 */
  fullDaySession?: boolean;
}

/** 生成 A 股全天 241 个分钟刻度：09:30~11:30(121) + 13:01~15:00(120)，与东财 trends2 点位一一对应 */
function sessionTicks(): string[] {
  const ticks: string[] = [];
  for (let m = 9 * 60 + 30; m <= 11 * 60 + 30; m++) ticks.push(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`.padStart(5, "0"));
  for (let m = 13 * 60 + 1; m <= 15 * 60; m++) ticks.push(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`.padStart(5, "0"));
  return ticks;
}

export function IndexTrendChart({ trend, prevClose, up, fullDaySession = false }: Props) {
  const elRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // 内容签名：轮询数据未变化时跳过重绘（否则每 15s notMerge 重建 + 重放动画、打断 tooltip）
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
    const last = trend[trend.length - 1];
    const sig = `${trend.length}|${last?.time}|${last?.price}|${prevClose}|${up}|${fullDaySession}`;
    if (sig === sigRef.current) return;
    const firstRender = sigRef.current === "";
    sigRef.current = sig;

    const color = up ? "#e11d48" : "#16a34a"; // 红涨绿跌
    // 全天轴数据点数超出 241（异常/含集合竞价）时回退为动态轴，避免溢出无标签
    const fixedTicks = fullDaySession ? sessionTicks() : null;
    const useFixed = !!fixedTicks && trend.length <= fixedTicks.length;
    const times = useFixed ? fixedTicks! : trend.map((p) => p.time);
    const prices = trend.map((p) => p.price);
    const noonIdx = useFixed ? 120 : Math.floor(times.length / 2);

    chart.setOption(
      {
        animation: firstRender, // 只在首帧播放入场动画，轮询更新不重放
        animationDuration: 300,
        grid: { left: 8, right: 8, top: 16, bottom: 24, containLabel: true },
        tooltip: {
          trigger: "axis",
          formatter: (params: { axisValue: string; data: number | undefined }[]) => {
            const p = params[0];
            if (p?.data == null) return ""; // 全天轴上还没走到的空槽位
            const pct = prevClose > 0 ? ((p.data - prevClose) / prevClose) * 100 : 0;
            return `${p.axisValue}<br/>点位 ${p.data.toFixed(2)}　${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
          },
        },
        xAxis: {
          type: "category",
          data: times,
          boundaryGap: false,
          axisLine: { lineStyle: { color: "rgba(113,113,122,0.2)" } },
          axisLabel: {
            color: "#a1a1aa",
            interval: (i: number) => i === 0 || i === noonIdx || i === times.length - 1,
            formatter: useFixed ? (v: string, i: number) => (i === 120 ? "11:30/13:00" : v) : undefined,
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
  }, [trend, prevClose, up, fullDaySession]);

  return <div ref={elRef} className="h-[260px] w-full" />;
}
