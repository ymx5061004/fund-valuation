"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Fund, Position, QuoteMetrics } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";
import { changeColor, cn, formatNav, formatPct } from "@/lib/utils";
import { NavChart } from "@/components/nav-chart";
import { ImportSheet } from "@/components/import-sheet";

const PERIODS: { key: string; label: string; days: number }[] = [
  { key: "1m", label: "近1月", days: 21 },
  { key: "3m", label: "近3月", days: 63 },
  { key: "6m", label: "近6月", days: 126 },
  { key: "1y", label: "近1年", days: 250 },
];

function Pct({ v }: { v: number | null | undefined }) {
  if (v == null) return <span className="text-zinc-300 dark:text-zinc-600">--</span>;
  return <span className={changeColor(v)}>{formatPct(v)}</span>;
}

export function FundDetail({ code }: { code: string }) {
  const router = useRouter();
  const [fund, setFund] = useState<Fund | null>(null);
  const [metrics, setMetrics] = useState<QuoteMetrics | null>(null);
  const [period, setPeriod] = useState("3m");
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);

  const [watch, setWatch] = useLocalStorage<string[]>("fv.watchlist", []);
  const [, setPositions] = useLocalStorage<Position[]>("fv.positions", []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const [fr, qr] = await Promise.all([
          fetch(`/api/fund?code=${code}`),
          fetch(`/api/quotes?codes=${code}`),
        ]);
        if (cancelled) return;
        if (fr.ok) {
          const fj = (await fr.json()) as { data: Fund | null };
          setFund(fj.data);
        }
        if (qr.ok) {
          const qj = (await qr.json()) as { data: QuoteMetrics[] };
          setMetrics(qj.data[0] ?? null);
        }
      } catch {
        // 忽略
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  const days = PERIODS.find((p) => p.key === period)?.days ?? 63;

  // 周期内净值切片（图表用）
  const slicedFund = useMemo<Fund | null>(
    () => (fund ? { ...fund, navHistory: fund.navHistory.slice(-days) } : null),
    [fund, days],
  );

  // 净值历史（含日涨幅，最新在前）
  const navRows = useMemo(() => {
    if (!fund) return [];
    const h = fund.navHistory;
    const withChange = h.map((p, i) => ({
      date: p.date,
      nav: p.nav,
      change: i > 0 && h[i - 1].nav > 0 ? ((p.nav - h[i - 1].nav) / h[i - 1].nav) * 100 : null,
    }));
    return withChange.slice(-days).reverse();
  }, [fund, days]);

  const name = fund?.name ?? metrics?.name ?? code;
  const inWatch = watch.includes(code);
  const presetFund = useMemo(() => ({ code, name }), [code, name]);

  const addPosition = (pos: Position) =>
    setPositions((prev) => {
      const i = prev.findIndex((x) => x.code === pos.code);
      if (i >= 0) {
        const next = [...prev];
        next[i] = pos;
        return next;
      }
      return [...prev, pos];
    });
  const toggleWatch = () => setWatch((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  return (
    <div className="mx-auto max-w-3xl pb-20">
      {/* 蓝色头部 */}
      <header className="bg-gradient-to-b from-blue-600 to-blue-500 px-4 pb-5 pt-3 text-white">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => router.back()} aria-label="返回" className="text-xl leading-none">
            ‹
          </button>
          <div className="min-w-0 flex-1 text-center">
            <div className="truncate text-base font-semibold">{name}</div>
            <div className="text-xs text-blue-100">{code}</div>
          </div>
          <span className="w-4" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div>
            <div className="text-xs text-blue-100">当日涨幅 {metrics?.navDate?.slice(5) ?? ""}</div>
            <div className="mt-0.5 flex items-baseline gap-1">
              <span className="text-2xl font-bold tabular-nums">{metrics ? formatPct(metrics.dayChangePct) : "--"}</span>
              {metrics?.dayEstimated && (
                <span className="rounded bg-white/25 px-1 py-0.5 text-[10px] font-medium leading-none">估</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-xs text-blue-100">最新净值</div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums">{metrics ? formatNav(metrics.nav) : "--"}</div>
          </div>
          <div>
            <div className="text-xs text-blue-100">近一年</div>
            <div className="mt-0.5 text-2xl font-bold tabular-nums">{metrics ? formatPct(metrics.yearPct ?? 0) : "--"}</div>
          </div>
        </div>
      </header>

      {/* 区间收益 */}
      <section className="grid grid-cols-4 divide-x divide-zinc-100 border-b border-zinc-100 py-3 text-center dark:divide-zinc-800 dark:border-zinc-800">
        {[
          { label: "本周", v: metrics?.weekPct },
          { label: "本月", v: metrics?.monthPct },
          { label: "今年来", v: metrics?.ytdPct },
          { label: "近一年", v: metrics?.yearPct },
        ].map((m) => (
          <div key={m.label}>
            <div className="text-xs text-zinc-400">{m.label}</div>
            <div className="mt-0.5 text-sm font-semibold tabular-nums">
              <Pct v={m.v} />
            </div>
          </div>
        ))}
      </section>

      {/* 净值走势 */}
      <section className="px-4 pt-4">
        <div className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">净值走势</div>
        {slicedFund ? (
          <NavChart fund={slicedFund} zoomStart={0} />
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-zinc-400">{loading ? "加载中…" : "暂无数据"}</div>
        )}
        <div className="mt-2 flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPeriod(p.key)}
              className={cn(
                "rounded-full px-3 py-1 text-xs transition-colors",
                period === p.key
                  ? "bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
                  : "text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* 净值历史 */}
      <section className="mt-4">
        <div className="grid grid-cols-3 gap-2 border-b border-zinc-100 px-4 py-2 text-xs text-zinc-400 dark:border-zinc-800">
          <span>日期</span>
          <span className="text-right">净值</span>
          <span className="text-right">日涨幅</span>
        </div>
        <ul className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
          {navRows.map((r) => (
            <li key={r.date} className="grid grid-cols-3 gap-2 px-4 py-3 text-sm">
              <span className="tabular-nums text-zinc-700 dark:text-zinc-300">{r.date}</span>
              <span className="text-right tabular-nums text-zinc-700 dark:text-zinc-300">{formatNav(r.nav)}</span>
              <span className="text-right font-medium tabular-nums">
                <Pct v={r.change} />
              </span>
            </li>
          ))}
          {navRows.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-zinc-400">{loading ? "加载中…" : "暂无净值数据"}</li>
          )}
        </ul>
      </section>

      {/* 底部操作栏 */}
      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto flex max-w-3xl gap-3 border-t border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-900">
        <button
          type="button"
          onClick={toggleWatch}
          className={cn(
            "flex-1 rounded-lg border py-2.5 text-sm font-medium",
            inWatch
              ? "border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              : "border-amber-300 text-amber-600 dark:border-amber-700 dark:text-amber-400",
          )}
        >
          {inWatch ? "删自选" : "加自选"}
        </button>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white"
        >
          添加持有
        </button>
      </div>

      <ImportSheet
        open={sheetOpen}
        editing={null}
        presetFund={presetFund}
        onClose={() => setSheetOpen(false)}
        onSave={addPosition}
        onRemove={() => {}}
      />
    </div>
  );
}
