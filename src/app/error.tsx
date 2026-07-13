"use client";

// 全局错误边界：运行时异常兜底，提供重试入口
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="text-4xl">⚠️</div>
      <div className="text-lg font-medium text-zinc-700 dark:text-zinc-200">页面出错了</div>
      <p className="max-w-sm text-sm text-zinc-400">{error.digest ? `错误编号 ${error.digest}` : "发生了意外错误，请重试。"}</p>
      <button
        type="button"
        onClick={reset}
        className="mt-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        重试
      </button>
    </div>
  );
}
