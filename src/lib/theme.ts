"use client";

import { useEffect, useState } from "react";

/** 外观偏好：跟随系统 / 强制浅色 / 强制深色。存 localStorage('fv.theme')。 */
export type ThemePref = "system" | "light" | "dark";

export const THEME_KEY = "fv.theme";

function readPref(): ThemePref {
  try {
    const raw = window.localStorage.getItem(THEME_KEY);
    if (raw === "light" || raw === "dark") return raw;
  } catch {
    // 隐私模式等读取失败按系统处理
  }
  return "system";
}

/** 按偏好切换 <html> 的 .dark class（与 layout.tsx 防闪烁脚本逻辑一致） */
function applyPref(pref: ThemePref) {
  const dark = pref === "dark" || (pref === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

/**
 * 主题偏好钩子。SSR 安全：首屏返回 "system"，挂载后读真实值。
 * 选「跟随系统」时监听系统主题变化实时应用。
 */
export function useTheme() {
  const [pref, setPref] = useState<ThemePref>("system");

  useEffect(() => {
    setPref(readPref());
  }, []);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyPref("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [pref]);

  const set = (next: ThemePref) => {
    setPref(next);
    try {
      if (next === "system") window.localStorage.removeItem(THEME_KEY);
      else window.localStorage.setItem(THEME_KEY, next);
    } catch {
      // 忽略写入失败
    }
    applyPref(next);
  };

  return [pref, set] as const;
}
