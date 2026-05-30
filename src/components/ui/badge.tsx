import type { ComponentProps } from "react";
import type { Signal } from "@/lib/types";
import { cn } from "@/lib/utils";

type Variant = "default" | "outline";

export function Badge({
  className,
  variant = "default",
  ...props
}: ComponentProps<"span"> & { variant?: Variant }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
        variant === "outline" && "border border-zinc-200 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300",
        className,
      )}
      {...props}
    />
  );
}

const SIGNAL_META: Record<Signal, { label: string; dot: string; box: string }> = {
  bullish: {
    label: "看涨",
    dot: "bg-red-500",
    box: "bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-400",
  },
  bearish: {
    label: "看跌",
    dot: "bg-green-500",
    box: "bg-green-50 text-green-700 dark:bg-green-950/60 dark:text-green-400",
  },
  neutral: {
    label: "震荡",
    dot: "bg-zinc-400",
    box: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
  },
};

/** 预测方向徽标（红涨绿跌） */
export function SignalBadge({ signal, className }: { signal: Signal; className?: string }) {
  const meta = SIGNAL_META[signal];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium",
        meta.box,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
      {meta.label}
    </span>
  );
}

export { SIGNAL_META };
