"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { AmvBoard } from "@/lib/types";
import { formatAmountCN } from "@/lib/amv";
import { changeColor, cn } from "@/lib/utils";
import { SignalBadge } from "@/components/ui/badge";

/** /market 顶部「活跃市值 0AMV」入口卡（点进 /amv 独立板块）。
 *  客户端拉 /api/amv（与板块同口径 buildAmvBoard），不依赖 /market 的构建时预渲染——
 *  东财瞬时限流时构建期抓不到也不会让入口整片空白；数据未就绪/失败时整条隐藏。 */
export function AmvStrip() {
  const [b, setB] = useState<AmvBoard | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/amv");
        if (!r.ok) return; // 冷启动/瞬时限流 503：保留上一帧，下一轮自愈
        const j = (await r.json()) as { data: AmvBoard | null };
        if (!cancelled && j.data) setB(j.data);
      } catch {
        // 忽略：入口卡是次要引导，失败就不显示
      }
    };
    void load();
    // 轮询兜住首拉失败（冷启动/限流），并顺带保持数值新鲜；失败保留已显示值不清空
    const id = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (!b) return null;
  return (
    <Link
      href="/amv"
      className="mt-2 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 shadow-sm transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">活跃市值 0AMV</span>
          <SignalBadge signal={b.analysis.signal} />
        </div>
        <div className="mt-0.5 truncate text-xs text-zinc-400">
          {b.analysis.state} · {b.coverage === "both" ? "大盘活跃资金（估算）" : "仅沪市（深市暂缺）"}
        </div>
      </div>
      <div className="ml-auto text-right">
        <div className="text-base font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatAmountCN(b.value)}</div>
        <div className={cn("text-xs font-medium tabular-nums", changeColor(b.change))}>
          {b.changePct >= 0 ? "+" : ""}
          {b.changePct.toFixed(2)}%
        </div>
      </div>
      <span className="shrink-0 text-zinc-300 dark:text-zinc-600">›</span>
    </Link>
  );
}
