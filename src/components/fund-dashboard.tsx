"use client";

import { useMemo, useState } from "react";
import type { Fund, Prediction, Signal } from "@/lib/types";
import { predict } from "@/lib/prediction";
import { changeColor, cn, formatNav, formatPct } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FundList } from "@/components/fund-list";
import { NavChart } from "@/components/nav-chart";
import { PredictionPanel } from "@/components/prediction-panel";

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-zinc-400">{label}</div>
        <div className={cn("mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50", valueClass)}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export function FundDashboard({ funds }: { funds: Fund[] }) {
  const [selectedCode, setSelectedCode] = useState(funds[0]?.code ?? "");

  // 所有基金的预测（用于列表徽标与概览统计）
  const predictions = useMemo(() => {
    const map: Record<string, Prediction> = {};
    for (const f of funds) map[f.code] = predict(f);
    return map;
  }, [funds]);

  const signals = useMemo(() => {
    const map: Record<string, Signal> = {};
    for (const code in predictions) map[code] = predictions[code].signal;
    return map;
  }, [predictions]);

  const selected = funds.find((f) => f.code === selectedCode) ?? funds[0];
  const selectedPrediction = predictions[selected.code];

  const stats = useMemo(() => {
    const list = Object.values(predictions);
    const bull = list.filter((p) => p.signal === "bullish").length;
    const bear = list.filter((p) => p.signal === "bearish").length;
    const avg = funds.reduce((s, f) => s + f.estimateChangePct, 0) / funds.length;
    return { bull, bear, avg };
  }, [predictions, funds]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
      {/* 标题 */}
      <header className="space-y-1">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-2xl">基金估值与涨跌预测</h1>
        <p className="text-sm text-zinc-500">盘中实时估值 · 技术指标方向研判 · 手机/电脑自适应（演示数据）</p>
      </header>

      {/* 概览统计：手机 2 列，PC 4 列 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="跟踪基金数" value={`${funds.length}`} />
        <Stat label="看涨" value={`${stats.bull}`} valueClass="text-red-600 dark:text-red-500" />
        <Stat label="看跌" value={`${stats.bear}`} valueClass="text-green-600 dark:text-green-500" />
        <Stat label="平均估值涨跌" value={formatPct(stats.avg)} valueClass={changeColor(stats.avg)} />
      </section>

      {/* 列表 */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-zinc-500">基金列表（点击查看详情）</h2>
        <FundList funds={funds} selectedCode={selected.code} signals={signals} onSelect={setSelectedCode} />
      </section>

      {/* 选中基金详情：PC 三栏（图表占 2 栏 + 预测 1 栏），手机上下堆叠 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{selected.name}</CardTitle>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                <span>{selected.code}</span>
                <Badge variant="outline">{selected.type}</Badge>
                <span>{selected.manager}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400">盘中估值</div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatNav(selected.estimateNav)}
                </span>
                <span className={cn("text-sm font-semibold tabular-nums", changeColor(selected.estimateChangePct))}>
                  {formatPct(selected.estimateChangePct)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <NavChart fund={selected} />
          </CardContent>
        </Card>

        <PredictionPanel prediction={selectedPrediction} />
      </section>
    </div>
  );
}
