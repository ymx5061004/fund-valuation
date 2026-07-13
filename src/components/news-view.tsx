"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FastNewsItem, NewsItem } from "@/lib/news";
import { cn } from "@/lib/utils";

type Tab = "list" | "fast";

/** 合并去重（按 code），保持原顺序 */
function mergeByCode<T extends { code: string }>(prev: T[], next: T[], prepend = false): T[] {
  const seen = new Set(prev.map((i) => i.code));
  const fresh = next.filter((i) => !seen.has(i.code));
  return prepend ? [...fresh, ...prev] : [...prev, ...fresh];
}

export function NewsView() {
  const [tab, setTab] = useState<Tab>("list");
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsPage, setNewsPage] = useState(1);
  const [newsDone, setNewsDone] = useState(false);
  const [fast, setFast] = useState<FastNewsItem[]>([]);
  const [fastSortEnd, setFastSortEnd] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  // 防竞态：只应用最后一次请求的结果
  const reqIdRef = useRef(0);

  const loadNews = useCallback(async (page: number) => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/news?tab=list&page=${page}`);
      const json = (await res.json()) as { data: NewsItem[] };
      if (reqId !== reqIdRef.current) return;
      if (json.data.length === 0) setNewsDone(true);
      setNews((prev) => (page === 1 ? json.data : mergeByCode(prev, json.data)));
      setNewsPage(page);
    } catch {
      if (reqId === reqIdRef.current) setError(true);
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, []);

  const loadFast = useCallback(async (sortEnd: string, mode: "replace" | "append" | "refresh") => {
    const reqId = ++reqIdRef.current;
    if (mode !== "refresh") {
      setLoading(true);
      setError(false);
    }
    try {
      const res = await fetch(`/api/news?tab=fast&sortEnd=${encodeURIComponent(sortEnd)}`);
      const json = (await res.json()) as { data: FastNewsItem[]; sortEnd: string };
      if (reqId !== reqIdRef.current) return;
      if (mode === "replace") {
        setFast(json.data);
        setFastSortEnd(json.sortEnd);
      } else if (mode === "append") {
        setFast((prev) => mergeByCode(prev, json.data));
        setFastSortEnd(json.sortEnd);
      } else {
        // 定时刷新：新快讯插到最前，不动翻页游标
        setFast((prev) => mergeByCode(prev, json.data, true));
      }
    } catch {
      if (reqId === reqIdRef.current && mode !== "refresh") setError(true);
    } finally {
      if (reqId === reqIdRef.current && mode !== "refresh") setLoading(false);
    }
  }, []);

  // 首次进入各 Tab 时加载
  useEffect(() => {
    if (tab === "list" && news.length === 0) void loadNews(1);
    if (tab === "fast" && fast.length === 0) void loadFast("", "replace");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // 快讯 Tab 每 60s 自动刷新（页面可见时）
  useEffect(() => {
    if (tab !== "fast") return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void loadFast("", "refresh");
    }, 60_000);
    return () => clearInterval(timer);
  }, [tab, loadFast]);

  const empty = tab === "list" ? news.length === 0 : fast.length === 0;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-3 px-4 py-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-50">资讯</h1>
        <span className="text-xs text-zinc-400">来源：东方财富</span>
      </div>

      <div className="flex gap-2">
        {(
          [
            { key: "list", label: "要闻" },
            { key: "fast", label: "7×24 快讯" },
          ] as { key: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition-colors",
              tab === t.key
                ? "bg-blue-600 font-medium text-white dark:bg-blue-500"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 首屏加载骨架 */}
      {loading && empty && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="animate-pulse rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              <div className="h-4 w-3/4 rounded bg-zinc-200 dark:bg-zinc-800" />
              <div className="mt-2 h-3 w-full rounded bg-zinc-100 dark:bg-zinc-800/60" />
              <div className="mt-1 h-3 w-1/2 rounded bg-zinc-100 dark:bg-zinc-800/60" />
            </div>
          ))}
        </div>
      )}

      {error && empty && (
        <div className="flex flex-col items-center gap-3 py-16 text-sm text-zinc-400">
          加载失败，请检查网络
          <button
            onClick={() => (tab === "list" ? loadNews(1) : loadFast("", "replace"))}
            className="rounded-lg border border-zinc-200 px-4 py-1.5 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            重试
          </button>
        </div>
      )}

      {tab === "list" && news.length > 0 && (
        <div className="flex flex-col gap-3">
          {news.map((n) => (
            <a
              key={n.code}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
            >
              <div className="font-medium leading-snug text-zinc-900 dark:text-zinc-50">{n.title}</div>
              {n.summary && (
                <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {n.summary}
                </p>
              )}
              <div className="mt-2 flex gap-2 text-xs text-zinc-400">
                {n.media && <span>{n.media}</span>}
                <span>{n.time}</span>
              </div>
            </a>
          ))}
          {!newsDone && (
            <button
              onClick={() => loadNews(newsPage + 1)}
              disabled={loading}
              className="rounded-xl border border-zinc-200 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {loading ? "加载中…" : "加载更多"}
            </button>
          )}
        </div>
      )}

      {tab === "fast" && fast.length > 0 && (
        <div className="flex flex-col">
          {fast.map((n) => (
            <a
              key={n.code}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative flex gap-3 border-l-2 border-zinc-200 pb-5 pl-4 dark:border-zinc-800"
            >
              <span className="absolute -left-[5px] top-1.5 h-2 w-2 rounded-full bg-zinc-300 group-hover:bg-blue-500 dark:bg-zinc-700" />
              <div className="min-w-0">
                <div className="text-xs tabular-nums text-zinc-400">{n.time.slice(11) || n.time}</div>
                <div
                  className={cn(
                    "mt-0.5 text-sm leading-relaxed",
                    n.important
                      ? "font-semibold text-red-600 dark:text-red-500"
                      : "text-zinc-700 dark:text-zinc-200",
                  )}
                >
                  {n.title || n.summary}
                </div>
                {n.title && n.summary && (
                  <p className="mt-0.5 line-clamp-3 text-xs leading-relaxed text-zinc-400">{n.summary}</p>
                )}
              </div>
            </a>
          ))}
          <button
            onClick={() => loadFast(fastSortEnd, "append")}
            disabled={loading}
            className="rounded-xl border border-zinc-200 py-2.5 text-sm text-zinc-500 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {loading ? "加载中…" : "加载更多"}
          </button>
        </div>
      )}
    </main>
  );
}
