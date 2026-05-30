import type { Prediction } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SignalBadge } from "@/components/ui/badge";

const SIGNAL_TEXT = {
  bullish: { title: "偏多 · 看涨", bar: "bg-red-500", tip: "技术指标偏向上行" },
  bearish: { title: "偏空 · 看跌", bar: "bg-green-500", tip: "技术指标偏向下行" },
  neutral: { title: "震荡 · 中性", bar: "bg-zinc-400", tip: "方向不明，建议观望" },
} as const;

function Indicator({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">{value}</div>
    </div>
  );
}

export function PredictionPanel({ prediction }: { prediction: Prediction }) {
  const meta = SIGNAL_TEXT[prediction.signal];
  const ind = prediction.indicators;
  // 把 -100~100 的打分映射到 0~100 的进度条位置
  const barPos = (prediction.score + 100) / 2;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>涨跌预测</CardTitle>
        <SignalBadge signal={prediction.signal} />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{meta.title}</span>
            <span className="text-sm text-zinc-400">综合打分 {prediction.score}</span>
          </div>
          {/* 打分进度条：左空头(绿) — 中性 — 右多头(红) */}
          <div className="relative mt-2 h-2 rounded-full bg-gradient-to-r from-green-400 via-zinc-200 to-red-400 dark:via-zinc-700">
            <div
              className="absolute top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-zinc-900 shadow dark:bg-white"
              style={{ left: `calc(${barPos}% - 2px)` }}
            />
          </div>
          <div className="mt-1.5 flex justify-between text-[11px] text-zinc-400">
            <span>看跌</span>
            <span>信号强度 {prediction.confidence}%</span>
            <span>看涨</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Indicator label="MA5 / MA20" value={`${ind.ma5} / ${ind.ma20}`} />
          <Indicator label="RSI(14)" value={`${ind.rsi14}`} />
          <Indicator label="近10日动量" value={`${ind.momentum10}%`} />
          <Indicator label="信号强度" value={`${prediction.confidence}%`} />
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium text-zinc-500">判断依据</div>
          <ul className="space-y-1.5">
            {prediction.reasons.map((r, i) => (
              <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300">
                <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", meta.bar)} />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="mt-auto rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-500">
          预测基于历史净值的技术指标推算，仅供参考，<strong>不构成投资建议</strong>。基金有风险，投资需谨慎。
        </p>
      </CardContent>
    </Card>
  );
}
