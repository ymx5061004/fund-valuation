// /market 是 async 服务端页面（要抓排行榜+净值历史），冷缓存/新部署首访时给骨架而非白屏
export default function Loading() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
        {/* 指数条骨架 */}
        <div className="flex gap-2 overflow-hidden pb-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-[88px] min-w-[30%] shrink-0 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800 sm:min-w-[150px]" />
          ))}
        </div>
        {/* 列表骨架 */}
        <div className="mt-4 flex flex-col gap-3">
          <div className="h-10 w-2/3 animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
          ))}
        </div>
      </div>
    </main>
  );
}
