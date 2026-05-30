"use client";

import { useEffect, useState } from "react";

/**
 * 与 localStorage 同步的状态钩子。
 * SSR 安全：首次渲染用 initial（服务端/客户端一致，避免注水不一致），
 * 挂载后再从 localStorage 读取真实值并写回。
 */
export function useLocalStorage<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw != null) setValue(JSON.parse(raw) as T);
    } catch {
      // 忽略读取/解析错误
    }
    setLoaded(true);
  }, [key]);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // 忽略写入错误（如隐私模式）
    }
  }, [key, value, loaded]);

  return [value, setValue] as const;
}
