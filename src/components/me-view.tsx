"use client";

import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useTheme, type ThemePref } from "@/lib/theme";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];

/** 本地数据项：key → 展示名。count 挂载后读取。 */
const DATA_KEYS: { key: string; label: string; desc: string }[] = [
  { key: "fv.positions", label: "持仓记录", desc: "「持有」页录入的份额与成本" },
  { key: "fv.watchlist", label: "自选基金", desc: "「自选」页与行情页 ★ 收藏" },
  { key: "fv.added", label: "手动添加的基金", desc: "行情页搜索添加的基金" },
  { key: "fv.holdings", label: "计算器份额", desc: "行情页持仓收益估算的输入" },
];

function readCount(key: string): number {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.length;
    if (parsed && typeof parsed === "object") return Object.keys(parsed).length;
    return 1;
  } catch {
    return 0;
  }
}

export function MeView() {
  const [pref, setPref] = useTheme();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [importMsg, setImportMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const refreshCounts = () => {
    const next: Record<string, number> = {};
    for (const d of DATA_KEYS) next[d.key] = readCount(d.key);
    setCounts(next);
  };

  useEffect(refreshCounts, []);

  const clearKey = (key: string, label: string) => {
    if (!window.confirm(`确定清除「${label}」吗？该操作不可恢复。`)) return;
    try {
      window.localStorage.removeItem(key);
    } catch {
      // 忽略
    }
    setCounts((c) => ({ ...c, [key]: 0 }));
  };

  // 导出备份：4 个 fv.* key 打包成 JSON 下载（数据都在本地，换浏览器/清缓存前可先备份）
  const exportBackup = () => {
    const payload: Record<string, unknown> = { _app: "fund-valuation", _exportedAt: new Date().toISOString() };
    for (const d of DATA_KEYS) {
      try {
        const raw = window.localStorage.getItem(d.key);
        if (raw != null) payload[d.key] = JSON.parse(raw);
      } catch {
        // 跳过坏数据
      }
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `基金估值备份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importBackup: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // 允许重复选择同一文件
    if (!file) return;
    try {
      const json = JSON.parse(await file.text()) as Record<string, unknown>;
      const known = DATA_KEYS.filter((d) => json[d.key] != null);
      if (known.length === 0) {
        setImportMsg("文件里没有可识别的备份数据");
        return;
      }
      if (!window.confirm(`将恢复：${known.map((d) => d.label).join("、")}。同名数据会被覆盖，继续？`)) return;
      for (const d of known) window.localStorage.setItem(d.key, JSON.stringify(json[d.key]));
      refreshCounts();
      setImportMsg(`已恢复 ${known.length} 项数据`);
    } catch {
      setImportMsg("导入失败：不是有效的备份文件");
    }
  };

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-4 px-4 py-6">
      <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">我的</h1>

      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>深色模式手动切换，或跟随系统设置</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            {THEME_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => setPref(o.value)}
                className={cn(
                  "flex-1 rounded-lg border px-3 py-2 text-sm transition-colors",
                  pref === o.value
                    ? "border-blue-600 bg-blue-50 font-medium text-blue-700 dark:border-blue-400 dark:bg-blue-950 dark:text-blue-300"
                    : "border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>本地数据</CardTitle>
          <CardDescription>数据仅存在浏览器本地（localStorage），不会上传服务器</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y divide-zinc-100 p-0 dark:divide-zinc-800">
          {DATA_KEYS.map((d) => (
            <div key={d.key} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
              <div className="min-w-0">
                <div className="text-sm text-zinc-800 dark:text-zinc-100">{d.label}</div>
                <div className="text-xs text-zinc-400">{d.desc}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs tabular-nums text-zinc-400">{counts[d.key] ?? 0} 条</span>
                <button
                  onClick={() => clearKey(d.key, d.label)}
                  disabled={!counts[d.key]}
                  className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs text-zinc-500 transition-colors hover:border-red-300 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-red-700 dark:hover:text-red-400"
                >
                  清除
                </button>
              </div>
            </div>
          ))}
          <div className="flex flex-col gap-2 px-4 py-3 sm:px-5">
            <div className="flex gap-2">
              <button
                onClick={exportBackup}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                导出备份
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                导入恢复
              </button>
              <input ref={fileRef} type="file" accept="application/json,.json" onChange={importBackup} className="hidden" />
            </div>
            {importMsg && <p className="text-center text-xs text-zinc-400">{importMsg}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>关于</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-zinc-600 dark:text-zinc-300">
          <p>基金估值与涨跌预测系统：盘中实时估值、净值走势、技术指标研判。</p>
          <p className="text-xs leading-relaxed text-zinc-400">
            数据来源于天天基金 / 东方财富公开接口（非官方），可能延迟或不准确，估值仅交易时段更新。
            涨跌预测由技术指标计算生成，仅供参考，不构成投资建议。市场有风险，投资需谨慎。
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
