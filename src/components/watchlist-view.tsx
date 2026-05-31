"use client";

import { useEffect, useMemo, useState } from "react";
import type { FundMeta, Quote } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";
import { changeColor, cn, formatNav, formatPct } from "@/lib/utils";
import { FundSearch } from "@/components/fund-search";

function starColor(chg: number | undefined): string {
  if (chg == null) return "text-zinc-300 dark:text-zinc-600";
  if (chg > 0) return "text-red-500";
  if (chg < 0) return "text-green-500";
  return "text-zinc-400";
}

export function WatchlistView() {
  const [watch, setWatch] = useLocalStorage<string[]>("fv.watchlist", []);
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [sortDesc, setSortDesc] = useState(true); // 默认按当日涨幅从高到低

  const codesParam = useMemo(() => watch.join(","), [watch]);

  // 拉取自选基金的实时估值（开页 + 每 20s 刷新，保证当日涨幅是最新的）
  useEffect(() => {
    if (!codesParam) {
      setQuotes({});
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const r = await fetch(`/api/estimate?codes=${codesParam}`);
        if (!r.ok) return;
        const j = (await r.json()) as { data: Quote[] };
        if (cancelled) return;
        const map: Record<string, Quote> = {};
        for (const q of j.data) map[q.code] = q;
        setQuotes(map);
      } catch {
        // 忽略
      }
    };
    void load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [codesParam]);

  const add = (m: FundMeta) => setWatch((prev) => (prev.includes(m.code) ? prev : [...prev, m.code]));
  const remove = (code: string) => setWatch((prev) => prev.filter((c) => c !== code));

  const rows = useMemo(() => {
    const list = watch.map((code) => ({ code, q: quotes[code] as Quote | undefined }));
    list.sort((a, b) => {
      const av = a.q?.estimateChangePct ?? -Infinity;
      const bv = b.q?.estimateChangePct ?? -Infinity;
      return sortDesc ? bv - av : av - bv;
    });
    return list;
  }, [watch, quotes, sortDesc]);

  return (
    <div className="mx-auto max-w-2xl">
      {/* 顶部栏 */}
      <header className="flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-sm">
            🐱
          </div>
          <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">基金</span>
        </div>
        <span className="text-sm text-zinc-400">自选 {watch.length} 只</span>
      </header>

      {/* 搜索添加 */}
      <div className="px-4">
        <FundSearch onAdd={add} adding={false} />
      </div>

      {watch.length === 0 ? (
        <div className="flex flex-col items-center px-4 pt-20 text-center">
          <div className="text-sm text-zinc-400">暂无自选</div>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-zinc-400">
            在上方搜索基金加入自选，或到「行情」页给基金点 ★ 收藏。
          </p>
        </div>
      ) : (
        <section className="mt-3">
          {/* 列头 */}
          <div className="grid grid-cols-[1.5fr_1fr_1fr] gap-2 px-4 py-2 text-xs text-zinc-400">
            <span>基金名称</span>
            <button
              type="button"
              onClick={() => setSortDesc((v) => !v)}
              className="flex items-center justify-end gap-0.5"
            >
              当日涨幅
              <span className="text-[10px]">{sortDesc ? "▼" : "▲"}</span>
            </button>
            <span className="text-right">当日估值</span>
          </div>
          {/* 行 */}
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map(({ code, q }) => (
              <li key={code} className="grid grid-cols-[1.5fr_1fr_1fr] items-center gap-2 px-4 py-3.5">
                <div className="flex min-w-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => remove(code)}
                    aria-label="取消自选"
                    className={cn("shrink-0 text-base leading-none", starColor(q?.estimateChangePct))}
                  >
                    ★
                  </button>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {q?.name ?? code}
                    </div>
                    <div className="mt-0.5 text-xs text-zinc-400">{code}</div>
                  </div>
                </div>
                <div className={cn("text-right text-base font-semibold tabular-nums", changeColor(q?.estimateChangePct ?? 0))}>
                  {q ? formatPct(q.estimateChangePct) : "--"}
                </div>
                <div className="text-right">
                  <div className="text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                    {q ? formatNav(q.estimateNav) : "--"}
                  </div>
                  <div className="mt-0.5 text-[11px] text-zinc-400">{q?.gztime?.slice(5, 10) ?? ""}</div>
                </div>
              </li>
            ))}
          </ul>
          <p className="px-4 py-3 text-center text-[11px] text-zinc-400">
            当日涨幅/估值来自天天基金实时估值，每 20 秒刷新 · 仅供参考
          </p>
        </section>
      )}
    </div>
  );
}
