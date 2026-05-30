"use client";

import { useEffect, useRef, useState } from "react";
import type { FundMeta } from "@/lib/types";

interface Props {
  onAdd: (meta: FundMeta) => void;
  adding: boolean;
}

/** 搜索任意基金（防抖调用 /api/search），选中后回调 onAdd。 */
export function FundSearch({ onAdd, adding }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FundMeta[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 防抖搜索
  useEffect(() => {
    const key = query.trim();
    if (!key) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?key=${encodeURIComponent(key)}`);
        if (res.ok) {
          const json = (await res.json()) as { data: FundMeta[] };
          setResults(json.data);
          setOpen(true);
        }
      } catch {
        // 忽略
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // 点击外部关闭下拉
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const pick = (m: FundMeta) => {
    onAdd(m);
    setOpen(false);
    setQuery("");
    setResults([]);
  };

  return (
    <div ref={boxRef} className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400">🔍</span>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder="搜索任意基金：输入代码或名称（如 161725 / 白酒 / 易方达）"
        className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-20 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:ring-blue-900"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-zinc-400">
        {adding ? "添加中…" : loading ? "搜索中…" : ""}
      </span>

      {open && results.length > 0 && (
        <ul className="absolute z-30 mt-1 max-h-80 w-full overflow-auto rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((m) => (
            <li key={m.code}>
              <button
                type="button"
                disabled={adding}
                onClick={() => pick(m)}
                className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{m.name}</span>
                  <span className="block truncate text-xs text-zinc-400">
                    {m.code} · {m.type} · {m.company} · {m.manager}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">+ 添加</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
