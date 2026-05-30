import type { Fund } from "@/lib/types";
import { changeColor, cn, formatNav } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Props {
  fund: Fund;
  /** 持有份额 */
  shares: number;
  onShares: (n: number) => void;
}

/** 持仓收益估算：按盘中实时估值估算市值与今日盈亏 */
export function HoldingsCalculator({ fund, shares, onShares }: Props) {
  const marketValue = shares * fund.estimateNav;
  const todayPnL = shares * (fund.estimateNav - fund.nav);

  return (
    <Card>
      <CardHeader>
        <CardTitle>持仓收益估算</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <label className="block">
          <span className="text-xs text-zinc-400">持有份额（份）</span>
          <input
            type="number"
            inputMode="decimal"
            min={0}
            value={shares || ""}
            onChange={(e) => onShares(Math.max(0, Number(e.target.value) || 0))}
            placeholder="输入你的持有份额"
            className="mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:ring-blue-900"
          />
        </label>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
            <div className="text-xs text-zinc-400">估算市值（元）</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
              {marketValue.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
            <div className="text-xs text-zinc-400">今日估算盈亏（元）</div>
            <div className={cn("mt-0.5 text-sm font-semibold tabular-nums", changeColor(todayPnL))}>
              {todayPnL > 0 ? "+" : ""}
              {todayPnL.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        <p className="text-[11px] leading-relaxed text-zinc-400">
          按盘中估值 {formatNav(fund.estimateNav)}（昨日净值 {formatNav(fund.nav)}）估算，
          实际收益以基金公司公布的当日净值为准。
        </p>
      </CardContent>
    </Card>
  );
}
