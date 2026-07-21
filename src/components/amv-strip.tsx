import Link from "next/link";
import { fetchKline } from "@/lib/eastmoney";
import { analyzeAmv, computeAmvSeries, dropUnfinishedToday } from "@/lib/amv";
import { SignalBadge } from "@/components/ui/badge";

/** 沪指活跃市值(0AMV)摘要条（服务端组件，随 /market 的 ISR 更新）。
 *  点击进入上证指数详情页查看完整 0AMV 面板；数据不足/上游失败时整条隐藏。 */
export async function AmvStrip() {
  const candles = await fetchKline("1.000001", 101, 120);
  // 截尾同 AmvPanel：上游忽略 lmt 返回全量历史，只取近段算滚动合计（analyzeAmv 只读尾部，结果一致）
  const analysis = analyzeAmv(computeAmvSeries(dropUnfinishedToday(candles, "1.000001").slice(-160)));
  if (!analysis) return null;
  return (
    <Link
      href="/index/1.000001"
      className="mt-2 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
    >
      <span className="shrink-0 font-medium text-zinc-700 dark:text-zinc-200">沪指活跃市值</span>
      <SignalBadge signal={analysis.signal} />
      <span className="min-w-0 truncate text-zinc-500 dark:text-zinc-400">
        {analysis.state} · 近5日{analysis.trend5Pct >= 0 ? "+" : ""}
        {analysis.trend5Pct.toFixed(1)}%
      </span>
      <span className="ml-auto shrink-0 text-zinc-400">详情 ›</span>
    </Link>
  );
}
