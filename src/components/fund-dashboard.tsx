"use client";

import { useEffect, useMemo, useState } from "react";
import type { Fund, FundMeta, FundType, Prediction, Signal } from "@/lib/types";
import { predict } from "@/lib/prediction";
import { useLocalStorage } from "@/lib/use-local-storage";
import { changeColor, cn, formatNav, formatPct } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FundList } from "@/components/fund-list";
import { FundToolbar, type SortKey } from "@/components/fund-toolbar";
import { NavChart } from "@/components/nav-chart";
import { PredictionPanel } from "@/components/prediction-panel";
import { HoldingsCalculator } from "@/components/holdings-calculator";
import { FundSearch } from "@/components/fund-search";

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);

interface EstimateDTO {
  code: string;
  name: string;
  nav: number;
  estimateNav: number;
  estimateChangePct: number;
  gztime: string;
}

function Stat({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs text-zinc-400">{label}</div>
        <div className={cn("mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50", valueClass)}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export function FundDashboard({ funds: initialFunds, source }: { funds: Fund[]; source: "live" | "mock" }) {
  const [funds, setFunds] = useState(initialFunds);
  const [selectedCode, setSelectedCode] = useState(initialFunds[0]?.code ?? "");
  const codesParam = useMemo(() => funds.map((f) => f.code).join(","), [funds]);

  // 列表筛选/排序状态
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FundType | "all">("all");
  const [sort, setSort] = useState<SortKey>("change-desc");
  const [onlyWatch, setOnlyWatch] = useState(false);

  // 持久化：自选 & 持仓份额
  const [watch, setWatch] = useLocalStorage<string[]>("fv.watchlist", []);
  const [holdings, setHoldings] = useLocalStorage<Record<string, number>>("fv.holdings", {});

  // 用户搜索添加的基金：持久化代码，挂载后按需拉取完整数据
  const [addedCodes, setAddedCodes] = useLocalStorage<string[]>("fv.added", []);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  // 模拟盘中实时刷新
  const [live, setLive] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  // 开启后每 15s 轮询 /api/estimate 拉取真实盘中估值。
  // 非交易时段估值不变属正常；只更新估值字段，navHistory 引用不变，图表不重绘。
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/estimate?codes=${codesParam}`);
        if (!res.ok) return;
        const json = (await res.json()) as { data: EstimateDTO[]; updatedAt: string };
        if (cancelled) return;
        const map = new Map(json.data.map((e) => [e.code, e]));
        setFunds((prev) =>
          prev.map((f) => {
            const e = map.get(f.code);
            return e ? { ...f, nav: e.nav, estimateNav: e.estimateNav, estimateChangePct: e.estimateChangePct } : f;
          }),
        );
        const d = new Date(json.updatedAt);
        setUpdatedAt(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
      } catch {
        // 网络异常时静默跳过本次
      }
    };
    void poll();
    const id = setInterval(poll, 15000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [live, codesParam]);

  // 拉取已添加但尚未加载的基金完整数据
  useEffect(() => {
    const missing = addedCodes.filter((c) => !funds.some((f) => f.code === c));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      const fetched = await Promise.all(
        missing.map(async (c) => {
          try {
            const r = await fetch(`/api/fund?code=${c}`);
            if (!r.ok) return null;
            const j = (await r.json()) as { data: Fund | null };
            return j.data;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const valid = fetched.filter((f): f is Fund => f !== null);
      if (valid.length > 0) {
        setFunds((prev) => [...prev, ...valid.filter((v) => !prev.some((p) => p.code === v.code))]);
      }
    })();
    return () => {
      cancelled = true;
    };
    // 仅依赖 addedCodes；funds 用于去重，故意不入依赖以免循环
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addedCodes]);

  const handleAdd = async (meta: FundMeta) => {
    setAddError(null);
    if (funds.some((f) => f.code === meta.code)) {
      setSelectedCode(meta.code);
      return;
    }
    setAdding(true);
    try {
      const r = await fetch(`/api/fund?code=${meta.code}`);
      const j = (await r.json()) as { data: Fund | null };
      if (r.ok && j.data) {
        const fund = j.data;
        setFunds((prev) => (prev.some((p) => p.code === fund.code) ? prev : [...prev, fund]));
        setSelectedCode(fund.code);
        setAddedCodes((prev) => (prev.includes(fund.code) ? prev : [...prev, fund.code]));
      } else {
        setAddError(`「${meta.name}」暂时无法获取数据`);
      }
    } catch {
      setAddError("添加失败，请重试");
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = (code: string) => {
    setAddedCodes((prev) => prev.filter((c) => c !== code));
    setFunds((prev) => prev.filter((f) => f.code !== code));
    if (selectedCode === code) setSelectedCode(initialFunds[0]?.code ?? "");
  };

  const watchSet = useMemo(() => new Set(watch), [watch]);
  const toggleWatch = (code: string) =>
    setWatch((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));

  // 全部基金的预测（列表徽标 + 统计）。预测基于历史净值，实时估值跳动不影响它。
  const predictions = useMemo(() => {
    const map: Record<string, Prediction> = {};
    for (const f of funds) map[f.code] = predict(f);
    return map;
  }, [funds]);

  const signals = useMemo(() => {
    const map: Record<string, Signal> = {};
    for (const code in predictions) map[code] = predictions[code].signal;
    return map;
  }, [predictions]);

  // 筛选 + 排序
  const visible = useMemo(() => {
    let list = funds;
    if (onlyWatch) list = list.filter((f) => watchSet.has(f.code));
    if (typeFilter !== "all") list = list.filter((f) => f.type === typeFilter);
    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (f) => f.name.toLowerCase().includes(q) || f.code.includes(q) || f.manager.toLowerCase().includes(q),
      );
    }
    const sorted = [...list];
    const rank: Record<Signal, number> = { bullish: 0, neutral: 1, bearish: 2 };
    switch (sort) {
      case "change-desc":
        sorted.sort((a, b) => b.estimateChangePct - a.estimateChangePct);
        break;
      case "change-asc":
        sorted.sort((a, b) => a.estimateChangePct - b.estimateChangePct);
        break;
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name, "zh"));
        break;
      case "signal":
        sorted.sort((a, b) => rank[signals[a.code]] - rank[signals[b.code]]);
        break;
    }
    return sorted;
  }, [funds, onlyWatch, watchSet, typeFilter, query, sort, signals]);

  const selected = funds.find((f) => f.code === selectedCode) ?? funds[0];
  const selectedPrediction = predictions[selected.code];

  const stats = useMemo(() => {
    const list = Object.values(predictions);
    const bull = list.filter((p) => p.signal === "bullish").length;
    const bear = list.filter((p) => p.signal === "bearish").length;
    const avg = funds.reduce((s, f) => s + f.estimateChangePct, 0) / funds.length;
    return { bull, bear, avg };
  }, [predictions, funds]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-6 sm:px-6 lg:py-8">
      {/* 标题 + 实时刷新开关 */}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-2xl">基金估值与涨跌预测</h1>
            {source === "live" ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/60 dark:text-green-400">
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                实时数据
              </span>
            ) : (
              <span className="rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-500">
                演示数据
              </span>
            )}
          </div>
          <p className="text-sm text-zinc-500">数据来自天天基金 · 技术指标方向研判 · 手机/电脑自适应</p>
        </div>
        <button
          type="button"
          onClick={() => setLive((v) => !v)}
          className={cn(
            "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
            live
              ? "border-red-300 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400"
              : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
          )}
        >
          <span className={cn("h-2 w-2 rounded-full", live ? "animate-pulse bg-red-500" : "bg-zinc-400")} />
          {live ? `实时中 · ${updatedAt ?? "--:--:--"}` : "实时估值刷新"}
        </button>
      </header>

      {/* 概览统计 */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="跟踪基金数" value={`${funds.length}`} />
        <Stat label="看涨" value={`${stats.bull}`} valueClass="text-red-600 dark:text-red-500" />
        <Stat label="看跌" value={`${stats.bear}`} valueClass="text-green-600 dark:text-green-500" />
        <Stat label="平均估值涨跌" value={formatPct(stats.avg)} valueClass={changeColor(stats.avg)} />
      </section>

      {/* 搜索任意基金 */}
      <section className="space-y-2">
        <FundSearch onAdd={handleAdd} adding={adding} />
        {addError && <p className="text-xs text-red-500">{addError}</p>}
        {addedCodes.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-400">已添加：</span>
            {addedCodes.map((c) => {
              const f = funds.find((x) => x.code === c);
              return (
                <span
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  <button type="button" onClick={() => setSelectedCode(c)} className="hover:underline">
                    {f ? f.name : c}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemove(c)}
                    aria-label="移除"
                    className="ml-0.5 text-base leading-none text-blue-400 hover:text-red-500"
                  >
                    ×
                  </button>
                </span>
              );
            })}
          </div>
        )}
      </section>

      {/* 工具栏 + 列表 */}
      <section className="space-y-3">
        <FundToolbar
          query={query}
          onQuery={setQuery}
          type={typeFilter}
          onType={setTypeFilter}
          sort={sort}
          onSort={setSort}
          onlyWatch={onlyWatch}
          onOnlyWatch={setOnlyWatch}
          watchCount={watch.length}
          resultCount={visible.length}
        />
        <FundList
          funds={visible}
          selectedCode={selected.code}
          signals={signals}
          watchSet={watchSet}
          onSelect={setSelectedCode}
          onToggleWatch={toggleWatch}
        />
      </section>

      {/* 选中基金详情 */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>{selected.name}</CardTitle>
              <div className="mt-1 flex items-center gap-2 text-xs text-zinc-400">
                <span>{selected.code}</span>
                <Badge variant="outline">{selected.type}</Badge>
                <span>{selected.manager}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-zinc-400">盘中估值</div>
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {formatNav(selected.estimateNav)}
                </span>
                <span className={cn("text-sm font-semibold tabular-nums", changeColor(selected.estimateChangePct))}>
                  {formatPct(selected.estimateChangePct)}
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <NavChart fund={selected} />
          </CardContent>
        </Card>

        <div className="space-y-4">
          <PredictionPanel prediction={selectedPrediction} />
          <HoldingsCalculator
            fund={selected}
            shares={holdings[selected.code] ?? 0}
            onShares={(n) => setHoldings((prev) => ({ ...prev, [selected.code]: n }))}
          />
        </div>
      </section>
    </div>
  );
}
