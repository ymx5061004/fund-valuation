"use client";

import { useEffect, useRef } from "react";

/** 北京时间是否处于 A 股交易时段附近（周一~五 9:15-11:35 / 12:55-15:05，含少量缓冲）。
 *  用 UTC+8 计算，与用户设备时区无关。不做节假日判断——误判只是多刷几次，反之会漏刷。 */
export function isAShareTradingTime(): boolean {
  const bj = new Date(Date.now() + 8 * 3600000);
  const day = bj.getUTCDay();
  if (day === 0 || day === 6) return false;
  const mins = bj.getUTCHours() * 60 + bj.getUTCMinutes();
  return (mins >= 9 * 60 + 15 && mins <= 11 * 60 + 35) || (mins >= 12 * 60 + 55 && mins <= 15 * 60 + 5);
}

interface PollingOpts {
  /** 活跃间隔（ms） */
  activeMs: number;
  /** 非活跃间隔（ms），默认与 activeMs 相同 */
  idleMs?: number;
  /** 判断当前是否活跃（如交易时段）；返回 false 时用 idleMs 降频。需为稳定引用（模块级函数或 useCallback） */
  isActive?: () => boolean;
  /** 变化时重启轮询并立即刷一次（如 secid） */
  key?: unknown;
}

/**
 * 页面可见性感知的轮询钩子：
 * - 标签页隐藏时不发请求（避免后台空转打上游），恢复可见立即刷一次并重启计时；
 * - 可按 isActive()（如 A 股交易时段）在活跃/降频两档间自动切换。
 * load 通过 ref 调用，无需稳定引用。
 */
export function usePolling(load: () => void | Promise<void>, { activeMs, idleMs, isActive, key }: PollingOpts) {
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;

    const schedule = () => {
      if (stopped) return;
      const ms = !isActive || isActive() ? activeMs : idleMs ?? activeMs;
      timer = setTimeout(tick, ms);
    };
    const tick = () => {
      if (stopped) return;
      if (document.visibilityState === "visible") void loadRef.current();
      schedule();
    };

    void loadRef.current();
    schedule();

    const onVisible = () => {
      if (document.visibilityState !== "visible" || stopped) return;
      if (timer) clearTimeout(timer);
      void loadRef.current();
      schedule();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMs, idleMs, isActive, key]);
}
