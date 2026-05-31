"use client";

import { useEffect, useState } from "react";
import type { IndexQuote } from "@/lib/types";
import { changeColor, cn } from "@/lib/utils";

/** 大盘指数横向滚动条（A股 + 港股 + 美股 + 日经，红涨绿跌，每 15s 刷新）。 */
export function IndexBar() {
  const [indices, setIndices] = useState<IndexQuote[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch("/api/indices");
        if (!r.ok) return;
        const j = (await r.json()) as { data: IndexQuote[] };
        if (!cancelled) setIndices(j.data);
      } catch {
        // 忽略
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  if (indices.length === 0) return null;

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {indices.map((idx) => {
        const up = idx.changePct > 0;
        const flat = idx.changePct === 0;
        return (
          <div
            key={idx.code}
            className={cn(
              "min-w-[30%] shrink-0 rounded-xl px-3 py-2.5 text-center sm:min-w-[150px]",
              flat
                ? "bg-zinc-100 dark:bg-zinc-800"
                : up
                  ? "bg-red-50 dark:bg-red-950/30"
                  : "bg-green-50 dark:bg-green-950/30",
            )}
          >
            <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">{idx.name}</div>
            <div className={cn("mt-1 text-lg font-bold tabular-nums", changeColor(idx.changePct))}>
              {idx.price.toFixed(2)}
            </div>
            <div className={cn("mt-0.5 text-xs tabular-nums", changeColor(idx.changePct))}>
              {idx.change > 0 ? "+" : ""}
              {idx.change.toFixed(2)} {idx.changePct > 0 ? "+" : ""}
              {idx.changePct.toFixed(2)}%
            </div>
          </div>
        );
      })}
    </div>
  );
}
