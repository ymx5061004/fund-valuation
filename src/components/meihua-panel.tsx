"use client";

import { useEffect, useState } from "react";
import type { MeihuaReading } from "@/lib/meihua";
import { castMeihua, nextTradingDay } from "@/lib/meihua";
import { changeColor, cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** 卦画：六爻自下而上存储，自上而下渲染；阳爻实线、阴爻断线，动爻高亮并标记 */
function HexFigure({ lines, movingLine, label }: { lines: number[]; movingLine?: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="flex flex-col-reverse gap-1">
        {lines.map((v, i) => {
          const isMoving = movingLine === i + 1;
          const bar = cn("h-1.5 rounded-sm", isMoving ? "bg-amber-500" : "bg-zinc-500 dark:bg-zinc-400");
          return (
            <div key={i} className="flex w-14 items-center justify-center gap-1.5">
              {v === 1 ? (
                <span className={cn(bar, "w-14")} />
              ) : (
                <>
                  <span className={cn(bar, "w-6")} />
                  <span className={cn(bar, "w-6")} />
                </>
              )}
            </div>
          );
        })}
      </div>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
  );
}

/**
 * 梅花易数卦象面板（纯娱乐）：按基金代码 + 目标交易日（下一个尚未收盘的交易日）数字起卦，
 * 体用生克断涨跌倾向。挂载后再起卦：目标日按用户本地时刻推算，服务端渲染可能与客户端
 * 跨日不一致，首屏渲染占位、useEffect 后出卦（与 localStorage 状态的处理方式一致）。
 * 每分钟核对一次目标日：长驻页面跨收盘/跨零点时自动换卦（日期未变则不重渲染）。
 */
export function MeihuaPanel({ code }: { code: string }) {
  // null=挂载前占位；"invalid"=起卦失败（非法代码等），整卡隐藏
  const [reading, setReading] = useState<MeihuaReading | null | "invalid">(null);

  useEffect(() => {
    const cast = () =>
      setReading((prev) => {
        const target = nextTradingDay();
        if (prev && prev !== "invalid" && prev.targetDate === target) return prev;
        return castMeihua(code, target) ?? "invalid";
      });
    cast();
    const id = setInterval(cast, 60_000);
    return () => clearInterval(id);
  }, [code]);

  if (reading === "invalid") return null;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>周易卦象 · 梅花易数</CardTitle>
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
          仅供娱乐
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {!reading ? (
          <p className="py-6 text-center text-sm text-zinc-400">起卦中…</p>
        ) : (
          <>
            <div className="flex items-center justify-center gap-6 sm:gap-10">
              <HexFigure lines={reading.lines} movingLine={reading.movingLine} label={`本卦 ${reading.hexName}`} />
              <span className="text-zinc-300 dark:text-zinc-600">→</span>
              <HexFigure lines={reading.changedLines} label={`变卦 ${reading.changedHexName}`} />
            </div>

            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                <div className="text-xs text-zinc-400">体卦</div>
                <div className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">
                  {reading.body.symbol} {reading.body.name}（{reading.body.element}）
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                <div className="text-xs text-zinc-400">用卦</div>
                <div className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">
                  {reading.use.symbol} {reading.use.name}（{reading.use.element}）
                </div>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                <div className="text-xs text-zinc-400">互卦</div>
                <div className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">{reading.mutualHexName}</div>
              </div>
              <div className="rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/60">
                <div className="text-xs text-zinc-400">动爻</div>
                <div className="mt-0.5 font-medium text-zinc-800 dark:text-zinc-200">第 {reading.movingLine} 爻</div>
              </div>
            </div>

            <div className="rounded-xl bg-zinc-50 px-4 py-3 dark:bg-zinc-800/60">
              <div className="flex items-baseline justify-between">
                <span className={cn("text-lg font-semibold", changeColor(reading.direction))}>
                  {reading.targetDate.slice(5).replace("-", "/")} {reading.tendency}
                </span>
                <span className="text-sm text-zinc-400">
                  {reading.relation} · {reading.luck}
                </span>
              </div>
              <p className="mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">{reading.explanation}。</p>
            </div>

            <p className="text-xs leading-relaxed text-zinc-400">
              梅花易数为传统数术文化，卦象由基金代码与日期演算生成，无任何统计学预测力，
              仅供娱乐与文化参考，不构成投资建议，也不参与本站技术指标分析。
              目标日按周末与主要法定休市推算，临时休市以交易所公告为准。
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
