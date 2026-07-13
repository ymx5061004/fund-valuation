"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Position, QuoteMetrics } from "@/lib/types";
import { useLocalStorage } from "@/lib/use-local-storage";
import { changeColor, cn, formatNav, formatPct } from "@/lib/utils";
import { ImportSheet } from "@/components/import-sheet";

function money(v: number, sign = false): string {
  const s = v.toLocaleString("zh-CN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return sign && v > 0 ? `+${s}` : s;
}

export function HoldingsView() {
  const [positions, setPositions, loaded] = useLocalStorage<Position[]>("fv.positions", []);
  const [quotes, setQuotes] = useState<Record<string, QuoteMetrics>>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Position | null>(null);
  // 防轮询乱序：只应用最后一次请求的结果
  const reqIdRef = useRef(0);

  const codesParam = useMemo(() => positions.map((p) => p.code).join(","), [positions]);

  // 持仓行情走 /api/quotes（dayNav/dayChangePct 与自选/详情同口径；
  // 不能用 /api/estimate 的 dwjz——它可能滞后一天，会把昨日涨幅重复计入当日收益），每 30s 刷新
  useEffect(() => {
    if (!codesParam) {
      setQuotes({});
      return;
    }
    const load = async () => {
      const reqId = ++reqIdRef.current;
      try {
        const r = await fetch(`/api/quotes?codes=${codesParam}`);
        if (!r.ok) return;
        const j = (await r.json()) as { data: QuoteMetrics[] };
        if (reqId !== reqIdRef.current) return;
        const map: Record<string, QuoteMetrics> = {};
        for (const q of j.data) map[q.code] = q;
        // 增量合并：部分失败/瞬时全挂时保留已展示数据，不整表清空
        setQuotes((prev) => ({ ...prev, ...map }));
      } catch {
        // 忽略，30s 后下一轮自愈
      }
    };
    void load();
    const id = setInterval(load, 30000);
    return () => {
      reqIdRef.current++;
      clearInterval(id);
    };
  }, [codesParam]);

  const rows = positions.map((p) => {
    const q = quotes[p.code];
    const cur = q ? q.dayNav : p.cost; // 无行情时退化为成本，避免 NaN；dayNav=估算时估值、结算后最新净值
    const marketValue = p.shares * cur;
    // 当日收益 = 份额 ×（当日净值 − 前收净值），由 dayNav 与 dayChangePct 反推前收，两种口径统一
    const todayPnL = q && q.dayChangePct > -100 ? p.shares * (q.dayNav - q.dayNav / (1 + q.dayChangePct / 100)) : 0;
    const holdPnL = p.shares * (cur - p.cost);
    const holdPnLPct = p.cost > 0 ? ((cur - p.cost) / p.cost) * 100 : 0;
    return { p, q, marketValue, todayPnL, holdPnL, holdPnLPct };
  });

  const totalAssets = rows.reduce((s, r) => s + r.marketValue, 0);
  const totalToday = rows.reduce((s, r) => s + r.todayPnL, 0);
  const totalHold = rows.reduce((s, r) => s + r.holdPnL, 0);

  const openAdd = () => {
    setEditing(null);
    setSheetOpen(true);
  };
  const openEdit = (p: Position) => {
    setEditing(p);
    setSheetOpen(true);
  };
  const save = (pos: Position) =>
    setPositions((prev) => {
      const i = prev.findIndex((x) => x.code === pos.code);
      if (i >= 0) {
        const next = [...prev];
        next[i] = pos;
        return next;
      }
      return [...prev, pos];
    });
  const remove = (code: string) => setPositions((prev) => prev.filter((p) => p.code !== code));

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
        <button
          type="button"
          onClick={openAdd}
          className="rounded-full bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-600 dark:bg-blue-950/50 dark:text-blue-400"
        >
          + 导入
        </button>
      </header>

      {/* 账户汇总 */}
      <section className="mx-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 px-5 py-5 dark:from-blue-950/40 dark:to-indigo-950/30">
        <div className="text-xs text-zinc-500 dark:text-zinc-400">默认账户 · 账户资产（估）</div>
        <div className="mt-1 text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          {money(totalAssets)}
        </div>
        <div className="mt-3 flex gap-6">
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">当日收益（估）</div>
            <div className={cn("mt-0.5 text-base font-semibold tabular-nums", positions.length ? changeColor(totalToday) : "text-zinc-400")}>
              {positions.length ? money(totalToday, true) : "--"}
            </div>
          </div>
          <div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">持有收益</div>
            <div className={cn("mt-0.5 text-base font-semibold tabular-nums", positions.length ? changeColor(totalHold) : "text-zinc-400")}>
              {positions.length ? money(totalHold, true) : "--"}
            </div>
          </div>
        </div>
      </section>

      {!loaded ? (
        /* 本地数据未读出前显示中性占位，避免有持仓的用户首帧闪「暂无基金」 */
        <div className="flex flex-col gap-3 px-4 pt-6">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      ) : positions.length === 0 ? (
        /* 空态 */
        <div className="flex flex-col items-center px-4 pt-16">
          <div className="text-sm text-zinc-400">暂无基金</div>
          <button
            type="button"
            onClick={openAdd}
            className="mt-8 w-full max-w-sm rounded-xl bg-gradient-to-r from-blue-500 to-indigo-500 py-3.5 text-center text-base font-medium text-white shadow-sm"
          >
            导入你的持有基金
          </button>
          <p className="mt-3 max-w-xs text-center text-xs leading-relaxed text-zinc-400">
            目前支持「手动导入」（搜索基金 + 填份额/成本）；截图一键导入即将支持。
          </p>
        </div>
      ) : (
        <section className="mt-4">
          {/* 表头 */}
          <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2 px-4 py-2 text-xs text-zinc-400">
            <span>基金名称</span>
            <span className="text-right">当日收益（估）</span>
            <span className="text-right">持有收益</span>
          </div>
          {/* 持仓行 */}
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {rows.map((r) => (
              <li key={r.p.code}>
                <button
                  type="button"
                  onClick={() => openEdit(r.p)}
                  className="grid w-full grid-cols-[1.4fr_1fr_1fr] gap-2 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{r.p.name}</div>
                    <div className="mt-0.5 text-xs text-zinc-400">
                      {r.p.code} · {r.p.shares} 份 · 成本 {formatNav(r.p.cost)}
                    </div>
                  </div>
                  <div className={cn("text-right text-sm font-semibold tabular-nums", changeColor(r.todayPnL))}>
                    {money(r.todayPnL, true)}
                    <div className="text-xs font-normal text-zinc-400">
                      {r.q ? formatPct(r.q.dayChangePct) : "--"}
                      {r.q?.dayEstimated && (
                        <span className="ml-0.5 rounded bg-zinc-100 px-0.5 text-[9px] text-zinc-500 dark:bg-zinc-700 dark:text-zinc-300">
                          估
                        </span>
                      )}
                    </div>
                  </div>
                  <div className={cn("text-right text-sm font-semibold tabular-nums", changeColor(r.holdPnL))}>
                    {money(r.holdPnL, true)}
                    <div className="text-xs font-normal text-zinc-400">{formatPct(r.holdPnLPct)}</div>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="px-4 py-4">
            <button
              type="button"
              onClick={openAdd}
              className="w-full rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
            >
              + 手动添加基金
            </button>
            <p className="mt-2 text-center text-[11px] text-zinc-400">点击持仓行可编辑/删除 · 收益按盘中估值估算，仅供参考</p>
          </div>
        </section>
      )}

      <ImportSheet open={sheetOpen} editing={editing} onClose={() => setSheetOpen(false)} onSave={save} onRemove={remove} />
    </div>
  );
}
