export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center gap-2 px-4 text-center">
      <div className="text-lg font-medium text-zinc-700 dark:text-zinc-200">{title}</div>
      <p className="text-sm text-zinc-400">敬请期待</p>
    </div>
  );
}
