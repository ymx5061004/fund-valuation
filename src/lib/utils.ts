import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** 合并 Tailwind class，处理冲突（如 p-2 与 p-4） */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 格式化涨跌幅，带正负号，如 +1.23% / -0.45% */
export function formatPct(v: number, digits = 2): string {
  return `${v > 0 ? "+" : ""}${v.toFixed(digits)}%`;
}

/** 格式化净值，保留 4 位小数 */
export function formatNav(v: number): string {
  return v.toFixed(4);
}

/**
 * A 股“红涨绿跌”配色：正值红、负值绿、0 中性灰。
 * 返回 Tailwind 文字颜色类。
 */
export function changeColor(v: number): string {
  if (v > 0) return "text-red-600 dark:text-red-500";
  if (v < 0) return "text-green-600 dark:text-green-500";
  return "text-zinc-500";
}
