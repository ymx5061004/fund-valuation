import type { BacktestResult } from "@/lib/backtest";
import { changeColor, cn, formatPct } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Metric({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
      <div className="text-xs text-zinc-400">{label}</div>
      <div className={cn("mt-0.5 text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200", valueClass)}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-zinc-400">{sub}</div>}
    </div>
  );
}

export function BacktestPanel({ result }: { result: BacktestResult | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>历史回测</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!result ? (
          <p className="text-sm text-zinc-400">历史数据不足，暂无法回测。</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2">
              <Metric
                label={`方向命中率（${result.horizon}日）`}
                value={result.directionalSamples > 0 ? `${(result.hitRate * 100).toFixed(0)}%` : "—"}
                sub={`${result.directionalSamples} 次方向信号`}
              />
              <Metric label="覆盖交易日" value={`${result.days}`} sub="逐日模拟" />
              <Metric
                label="信号策略收益"
                value={formatPct(result.signalReturn)}
                valueClass={changeColor(result.signalReturn)}
                sub="看涨持有 / 否则空仓"
              />
              <Metric
                label="一直持有收益"
                value={formatPct(result.buyHoldReturn)}
                valueClass={changeColor(result.buyHoldReturn)}
                sub="基准对照"
              />
            </div>
            <p className="text-[11px] leading-relaxed text-zinc-400">
              回测以「昨日信号」决定当日持有/空仓，与一直持有作对比。
              <strong className="text-zinc-500 dark:text-zinc-400">历史表现不代表未来</strong>，仅供参考。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
