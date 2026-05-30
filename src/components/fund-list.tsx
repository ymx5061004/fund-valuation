import type { Fund, Signal } from "@/lib/types";
import { changeColor, cn, formatNav, formatPct } from "@/lib/utils";
import { Badge, SignalBadge } from "@/components/ui/badge";

interface Props {
  funds: Fund[];
  selectedCode: string;
  signals: Record<string, Signal>;
  onSelect: (code: string) => void;
}

/**
 * 基金列表，演示「响应式表格」的标准做法：
 *  - 中屏及以上(md+) 渲染完整表格
 *  - 手机端隐藏表格，改用卡片列表（横向表格在手机上体验差）
 * 两种视图共用同一份数据与选中逻辑。
 */
export function FundList({ funds, selectedCode, signals, onSelect }: Props) {
  return (
    <>
      {/* ===== PC / 平板：表格 ===== */}
      <div className="hidden overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 text-left text-xs text-zinc-500 dark:border-zinc-800">
              <th className="px-4 py-3 font-medium">基金 / 代码</th>
              <th className="px-4 py-3 font-medium">类型</th>
              <th className="px-4 py-3 text-right font-medium">最新净值</th>
              <th className="px-4 py-3 text-right font-medium">盘中估值</th>
              <th className="px-4 py-3 text-right font-medium">估值涨跌</th>
              <th className="px-4 py-3 text-right font-medium">预测</th>
            </tr>
          </thead>
          <tbody>
            {funds.map((f) => (
              <tr
                key={f.code}
                onClick={() => onSelect(f.code)}
                className={cn(
                  "cursor-pointer border-b border-zinc-50 transition-colors last:border-0 hover:bg-zinc-50 dark:border-zinc-800/50 dark:hover:bg-zinc-800/50",
                  f.code === selectedCode && "bg-blue-50/70 hover:bg-blue-50 dark:bg-blue-950/30 dark:hover:bg-blue-950/40",
                )}
              >
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-900 dark:text-zinc-100">{f.name}</div>
                  <div className="text-xs text-zinc-400">{f.code} · {f.manager}</div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant="outline">{f.type}</Badge>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{formatNav(f.nav)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">{formatNav(f.estimateNav)}</td>
                <td className={cn("px-4 py-3 text-right font-semibold tabular-nums", changeColor(f.estimateChangePct))}>
                  {formatPct(f.estimateChangePct)}
                </td>
                <td className="px-4 py-3 text-right">
                  <SignalBadge signal={signals[f.code]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== 手机：卡片 ===== */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {funds.map((f) => (
          <button
            key={f.code}
            type="button"
            onClick={() => onSelect(f.code)}
            className={cn(
              "rounded-xl border bg-white p-4 text-left transition-colors dark:bg-zinc-900",
              f.code === selectedCode
                ? "border-blue-400 ring-1 ring-blue-200 dark:border-blue-600 dark:ring-blue-900"
                : "border-zinc-200 dark:border-zinc-800",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{f.name}</div>
                <div className="mt-0.5 text-xs text-zinc-400">{f.code} · {f.manager}</div>
              </div>
              <SignalBadge signal={signals[f.code]} />
            </div>
            <div className="mt-3 flex items-end justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{f.type}</Badge>
                <span className="text-xs text-zinc-400">估值 {formatNav(f.estimateNav)}</span>
              </div>
              <div className={cn("text-lg font-semibold tabular-nums", changeColor(f.estimateChangePct))}>
                {formatPct(f.estimateChangePct)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}
