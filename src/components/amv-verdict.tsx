import type { AmvAnalysis, Signal } from "@/lib/types";
import { AMV_WINDOW } from "@/lib/amv";
import { cn } from "@/lib/utils";

// 红涨绿跌：多=红 空=绿（与 SignalBadge 一致）
const DOT: Record<Signal, string> = { bullish: "bg-red-500", bearish: "bg-green-500", neutral: "bg-zinc-400" };

/** 研判依据列表 + 口诀 + 免责（活跃市值面板/独立板块共用）。
 *  estimateNote=true 时追加「公开数据估算、与指南针专有算法不同」说明；免责文案不可删。 */
export function AmvVerdict({ analysis, estimateNote = false }: { analysis: AmvAnalysis; estimateNote?: boolean }) {
  return (
    <>
      <div>
        <div className="mb-1.5 text-xs font-medium text-zinc-500">判断依据</div>
        <ul className="space-y-1.5">
          {analysis.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <span className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", DOT[analysis.signal])} />
              <span>{r}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-relaxed text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
        口诀：活筹涨，有钱赚，大胆持股；活筹跌，资金跑，降低仓位；指数新高活筹弱，准备离场；指数新低活筹稳，逢低布局。
      </div>

      <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-950/40 dark:text-amber-500">
        活跃市值以近{AMV_WINDOW}日成交额滚动合计近似「参与交易的活跃资金」，为大盘趋势先行参考——请结合 K
        线、筹码与板块热度综合研判，勿单独作为买卖依据；对筹码长期锁定的长线品种参考意义有限。
        {estimateNote && "本板块为公开成交额估算，与指南针等专有 0AMV 算法不同、数值不等同。"}
        <strong>不构成投资建议</strong>，市场有风险。
      </p>
    </>
  );
}
