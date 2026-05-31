"use client";

import { useEffect, useState } from "react";
import type { FundMeta, Position } from "@/lib/types";
import { cn } from "@/lib/utils";
import { FundSearch } from "@/components/fund-search";

interface Props {
  open: boolean;
  /** 不为 null 表示编辑已有持仓 */
  editing: Position | null;
  /** 预选基金（如从详情页“添加持有”进入），固定基金只填份额/成本 */
  presetFund?: { code: string; name: string } | null;
  onClose: () => void;
  onSave: (p: Position) => void;
  onRemove: (code: string) => void;
}

const inputClass =
  "mt-1 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm tabular-nums outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-800 dark:focus:ring-blue-900";

export function ImportSheet({ open, editing, presetFund, onClose, onSave, onRemove }: Props) {
  const [tab, setTab] = useState<"manual" | "screenshot">("manual");
  const [picked, setPicked] = useState<{ code: string; name: string } | null>(null);
  const [shares, setShares] = useState("");
  const [cost, setCost] = useState("");

  // 打开时按 editing 预填
  useEffect(() => {
    if (!open) return;
    setTab("manual");
    if (editing) {
      setPicked({ code: editing.code, name: editing.name });
      setShares(String(editing.shares));
      setCost(String(editing.cost));
    } else if (presetFund) {
      setPicked(presetFund);
      setShares("");
      setCost("");
    } else {
      setPicked(null);
      setShares("");
      setCost("");
    }
  }, [open, editing, presetFund]);

  if (!open) return null;

  const canSave = !!picked && Number(shares) > 0 && Number(cost) > 0;
  const submit = () => {
    if (!picked) return;
    onSave({ code: picked.code, name: picked.name, shares: Number(shares), cost: Number(cost) });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 pb-6 dark:bg-zinc-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 + 切换 */}
        <div className="mb-4 flex items-center justify-between">
          <div className="flex gap-4 text-sm">
            <button
              type="button"
              onClick={() => setTab("manual")}
              className={cn("pb-1 font-medium", tab === "manual" ? "border-b-2 border-blue-500 text-zinc-900 dark:text-zinc-50" : "text-zinc-400")}
            >
              {editing ? "编辑持仓" : "手动导入"}
            </button>
            {!editing && (
              <button
                type="button"
                onClick={() => setTab("screenshot")}
                className={cn("pb-1 font-medium", tab === "screenshot" ? "border-b-2 border-blue-500 text-zinc-900 dark:text-zinc-50" : "text-zinc-400")}
              >
                截图导入
              </button>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="关闭" className="text-zinc-400 hover:text-zinc-600">
            ✕
          </button>
        </div>

        {tab === "manual" ? (
          <div className="space-y-3">
            {/* 选基金 */}
            {picked ? (
              <div className="flex items-center justify-between rounded-lg border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-700">
                <span className="min-w-0 truncate">
                  {picked.name} <span className="text-xs text-zinc-400">{picked.code}</span>
                </span>
                {!editing && !presetFund && (
                  <button type="button" onClick={() => setPicked(null)} className="shrink-0 text-xs text-blue-600 dark:text-blue-400">
                    重选
                  </button>
                )}
              </div>
            ) : (
              <FundSearch onAdd={(m: FundMeta) => setPicked({ code: m.code, name: m.name })} adding={false} />
            )}

            <label className="block">
              <span className="text-xs text-zinc-400">持有份额（份）</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                value={shares}
                onChange={(e) => setShares(e.target.value)}
                placeholder="如 1000"
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="text-xs text-zinc-400">成本价（单位成本净值）</span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step="0.0001"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="如 1.2345"
                className={inputClass}
              />
            </label>

            <div className="flex gap-2 pt-1">
              {editing && (
                <button
                  type="button"
                  onClick={() => {
                    onRemove(editing.code);
                    onClose();
                  }}
                  className="rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 dark:border-red-900 dark:text-red-400"
                >
                  删除
                </button>
              )}
              <button
                type="button"
                disabled={!canSave}
                onClick={submit}
                className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {editing ? "保存" : "添加到持仓"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2 py-10 text-center">
            <div className="text-4xl">🖼️</div>
            <p className="text-sm text-zinc-500">截图导入即将支持</p>
            <p className="text-xs text-zinc-400">
              将支持识别支付宝 / 天天基金 / 腾讯理财通 / 蛋卷 等持仓截图。
              <br />
              目前请先用「手动导入」。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
