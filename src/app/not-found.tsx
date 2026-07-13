import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-3 px-4 text-center">
      <div className="text-4xl">🔍</div>
      <div className="text-lg font-medium text-zinc-700 dark:text-zinc-200">页面不存在</div>
      <p className="text-sm text-zinc-400">链接可能已失效，或基金/指数代码格式不正确。</p>
      <Link
        href="/"
        className="mt-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
      >
        返回首页
      </Link>
    </div>
  );
}
