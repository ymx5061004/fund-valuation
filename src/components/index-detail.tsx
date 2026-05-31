"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { IndexDetail } from "@/lib/types";
import { changeColor, cn } from "@/lib/utils";
import { IndexTrendChart } from "@/components/index-trend-chart";

const TABS = ["分时", "五日", "日K", "周K", "月K"];

/** 成交量(手)/成交额(元) → X.XX亿/万 */
function yi(v: number): string {
  if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (v >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return `${v}`;
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-zinc-400">{label}</span>
      <span className={cn("tabular-nums", valueClass ?? "text-zinc-700 dark:text-zinc-300")}>{value}</span>
    </div>
  );
}

export function IndexDetailView({ secid }: { secid: string }) {
  const router = useRouter();
  const [d, setD] = useState<IndexDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("分时");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const load = async () => {
      try {
        const r = await fetch(`/api/index?secid=${encodeURIComponent(secid)}`);
        if (r.ok) {
          const j = (await r.json()) as { data: IndexDetail | null };
          if (!cancelled) setD(j.data);
        }
      } catch {
        // 忽略
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const id = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [secid]);

  const up = (d?.changePct ?? 0) >= 0;

  return (
    <div className="mx-auto max-w-3xl">
      <header className="flex items-center gap-3 px-4 py-3">
        <button type="button" onClick={() => router.back()} aria-label="返回" className="text-2xl leading-none text-zinc-500">
          ‹
        </button>
        <div className="flex-1 text-center">
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{d?.name ?? "指数"}</div>
          <div className="text-xs text-zinc-400">{d?.code ?? secid}</div>
        </div>
        <span className="w-5" />
      </header>

      {!d ? (
        <div className="px-4 py-20 text-center text-sm text-zinc-400">{loading ? "加载中…" : "暂无数据"}</div>
      ) : (
        <>
          <section className="px-4 pb-3">
            <div className={cn("text-3xl font-bold tabular-nums", changeColor(d.changePct))}>{d.price.toFixed(2)}</div>
            <div className={cn("mt-0.5 text-sm font-medium tabular-nums", changeColor(d.changePct))}>
              {d.change >= 0 ? "+" : ""}
              {d.change.toFixed(2)}　{d.changePct >= 0 ? "+" : ""}
              {d.changePct.toFixed(2)}%
            </div>
            <div className="mt-3 grid grid-cols-3 gap-x-5 gap-y-2 text-sm">
              <Stat label="高" value={d.high.toFixed(2)} valueClass={changeColor(d.high - d.prevClose)} />
              <Stat label="开" value={d.open.toFixed(2)} valueClass={changeColor(d.open - d.prevClose)} />
              <Stat label="量" value={yi(d.volume)} />
              <Stat label="低" value={d.low.toFixed(2)} valueClass={changeColor(d.low - d.prevClose)} />
              <Stat label="昨" value={d.prevClose.toFixed(2)} />
              <Stat label="额" value={yi(d.amount)} />
            </div>
          </section>

          <div className="flex border-y border-zinc-100 dark:border-zinc-800">
            {TABS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 py-2.5 text-sm transition-colors",
                  tab === t
                    ? "border-b-2 border-blue-500 font-medium text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-400",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <section className="px-2 py-3">
            {tab === "分时" ? (
              d.trend.length > 0 ? (
                <IndexTrendChart trend={d.trend} prevClose={d.prevClose} up={up} />
              ) : (
                <div className="flex h-[260px] items-center justify-center text-sm text-zinc-400">暂无分时数据</div>
              )
            ) : (
              <div className="flex h-[260px] items-center justify-center text-sm text-zinc-400">{tab} 图即将支持</div>
            )}
          </section>

          <p className="px-4 pb-8 text-center text-[11px] text-zinc-400">
            行情来自东方财富，每 15 秒刷新 · 成分股 / K 线即将支持
          </p>
        </>
      )}
    </div>
  );
}
