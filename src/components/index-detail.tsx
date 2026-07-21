"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ConstituentStock, IndexDetail, KlineCandle } from "@/lib/types";
import { changeColor, cn } from "@/lib/utils";
import { isAShareTradingTime, usePolling } from "@/lib/use-polling";
import { IndexTrendChart } from "@/components/index-trend-chart";
import { KlineChart } from "@/components/kline-chart";
import { AmvPanel } from "@/components/amv-panel";

const TABS: { key: string; label: string; type?: string }[] = [
  { key: "分时", label: "分时" },
  { key: "五日", label: "五日", type: "5d" },
  { key: "日K", label: "日K", type: "d" },
  { key: "周K", label: "周K", type: "w" },
  { key: "月K", label: "月K", type: "m" },
];

function yi(v: number): string {
  if (v >= 1e12) return `${(v / 1e12).toFixed(2)}万亿`;
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

type ChartData = { kind: "line"; line: { time: string; price: number }[] } | { kind: "candle"; candle: KlineCandle[] };

export function IndexDetailView({ secid }: { secid: string }) {
  const router = useRouter();
  const [d, setD] = useState<IndexDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("分时");
  const [chart, setChart] = useState<ChartData | null>(null);
  const [chartLoading, setChartLoading] = useState(false);

  const [stocks, setStocks] = useState<ConstituentStock[]>([]);
  const [stockTotal, setStockTotal] = useState(0);
  const [stockPage, setStockPage] = useState(1);
  const [stockLoading, setStockLoading] = useState(false);

  const reqIdRef = useRef(0);
  // 连续拿不到数据（无效 secid/上游故障）时退避，不再 15s 无限重试
  const failCountRef = useRef(0);

  useEffect(() => {
    setLoading(true);
    setD(null);
    failCountRef.current = 0;
    reqIdRef.current++;
  }, [secid]);

  const isAShare = secid.startsWith("0.") || secid.startsWith("1.");
  const pollActive = useCallback(
    () => failCountRef.current < 3 && (!isAShare || isAShareTradingTime()),
    [isAShare],
  );

  // 行情 + 分时：交易时段 15s 刷新；非交易时段/连续失败降频到 5 分钟；标签页隐藏时暂停
  usePolling(
    async () => {
      const reqId = ++reqIdRef.current;
      try {
        const r = await fetch(`/api/index?secid=${encodeURIComponent(secid)}`);
        if (r.ok) {
          const j = (await r.json()) as { data: IndexDetail | null };
          if (reqId !== reqIdRef.current) return;
          if (j.data) {
            failCountRef.current = 0;
            setD(j.data);
          } else {
            failCountRef.current++;
          }
        } else if (reqId === reqIdRef.current) {
          failCountRef.current++;
        }
      } catch {
        failCountRef.current++;
      } finally {
        if (reqId === reqIdRef.current) setLoading(false);
      }
    },
    { activeMs: 15000, idleMs: 300000, isActive: pollActive, key: secid },
  );

  // 切到 五日/日K/周K/月K 时拉取对应数据
  useEffect(() => {
    const t = TABS.find((x) => x.key === tab)?.type;
    if (!t) {
      setChart(null);
      return;
    }
    let cancelled = false;
    setChartLoading(true);
    // 先清掉上一周期的数据：请求失败时兜底到「暂无数据」，而不是把周K蜡烛渲染在日K Tab 下
    setChart(null);
    (async () => {
      try {
        const r = await fetch(`/api/kline?secid=${encodeURIComponent(secid)}&type=${t}`);
        if (r.ok && !cancelled) setChart((await r.json()) as ChartData);
      } catch {
        // 忽略
      } finally {
        if (!cancelled) setChartLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, secid]);

  // 成分股首页
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/constituents?secid=${encodeURIComponent(secid)}&pn=1`);
        if (!r.ok) return;
        const j = (await r.json()) as { stocks: ConstituentStock[]; total: number };
        if (cancelled) return;
        setStocks(j.stocks);
        setStockTotal(j.total);
        setStockPage(1);
      } catch {
        // 忽略
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [secid]);

  const loadMoreStocks = async () => {
    setStockLoading(true);
    try {
      const next = stockPage + 1;
      const r = await fetch(`/api/constituents?secid=${encodeURIComponent(secid)}&pn=${next}`);
      if (r.ok) {
        const j = (await r.json()) as { stocks: ConstituentStock[]; total: number };
        // 涨跌幅榜是实时排序，翻页间排名漂移会让下一页含已展示的股票——按 code 去重防重复 key
        setStocks((prev) => {
          const seen = new Set(prev.map((s) => s.code));
          return [...prev, ...j.stocks.filter((s) => !seen.has(s.code))];
        });
        setStockPage(next);
      }
    } catch {
      // 忽略
    } finally {
      setStockLoading(false);
    }
  };

  const up = (d?.changePct ?? 0) >= 0;

  function renderChart() {
    if (tab === "分时") {
      return d && d.trend.length > 0 ? (
        // A 股分时用固定 9:30-15:00 全天轴（右侧留白表示未走完的交易时间）
        <IndexTrendChart trend={d.trend} prevClose={d.prevClose} up={up} fullDaySession={isAShare} />
      ) : (
        <Empty>{loading ? "加载中…" : "暂无分时数据"}</Empty>
      );
    }
    if (chartLoading) return <Empty>加载中…</Empty>;
    if (chart?.kind === "line") {
      if (chart.line.length === 0) return <Empty>暂无数据</Empty>;
      const base = chart.line[0]?.price ?? 0;
      const lineUp = (chart.line[chart.line.length - 1]?.price ?? 0) >= base;
      return <IndexTrendChart trend={chart.line} prevClose={base} up={lineUp} />;
    }
    if (chart?.kind === "candle") {
      return chart.candle.length > 0 ? <KlineChart data={chart.candle} /> : <Empty>暂无K线数据</Empty>;
    }
    return <Empty>暂无数据</Empty>;
  }

  return (
    <div className="mx-auto max-w-3xl pb-8">
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
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  "flex-1 py-2.5 text-sm transition-colors",
                  tab === t.key
                    ? "border-b-2 border-blue-500 font-medium text-zinc-900 dark:text-zinc-50"
                    : "text-zinc-400",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <section className="px-2 py-3">{renderChart()}</section>

          {/* 活跃市值 0AMV：活跃资金体量 · 真假涨跌 · 顶底背离 */}
          <section className="px-4 pb-1 pt-2">
            <AmvPanel secid={secid} />
          </section>

          {/* 成分股 */}
          {stocks.length > 0 && (
            <section className="mt-2">
              <div className="px-4 pb-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">成分股</div>
              <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 px-4 py-2 text-xs text-zinc-400">
                <span>股票名称</span>
                <span className="text-right">最新价</span>
                <span className="text-right">涨跌幅</span>
                <span className="text-right">流通市值</span>
              </div>
              <ul className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
                {stocks.map((s) => (
                  <li key={s.code} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] items-center gap-2 px-4 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{s.name}</div>
                      <div className="mt-0.5 text-xs text-zinc-400">{s.code}</div>
                    </div>
                    <div className={cn("text-right font-semibold tabular-nums", changeColor(s.changePct))}>
                      {s.price.toFixed(2)}
                    </div>
                    <div className={cn("text-right font-semibold tabular-nums", changeColor(s.changePct))}>
                      {s.changePct >= 0 ? "+" : ""}
                      {s.changePct.toFixed(2)}%
                    </div>
                    <div className="text-right tabular-nums text-zinc-600 dark:text-zinc-400">{yi(s.floatCap)}</div>
                  </li>
                ))}
              </ul>
              {stocks.length < stockTotal && (
                <button
                  type="button"
                  onClick={loadMoreStocks}
                  disabled={stockLoading}
                  className="w-full py-3 text-center text-sm text-blue-600 disabled:opacity-50 dark:text-blue-400"
                >
                  {stockLoading ? "加载中…" : "查看更多 ›"}
                </button>
              )}
            </section>
          )}

          <p className="px-4 pt-2 text-center text-[11px] text-zinc-400">行情来自东方财富，交易时段每 15 秒刷新 · 仅供参考</p>
        </>
      )}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-[260px] items-center justify-center text-sm text-zinc-400">{children}</div>;
}
