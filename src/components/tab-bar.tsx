"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "持有", d: "M12 3 2 8l10 5 10-5-10-5zM2 12l10 5 10-5M2 16l10 5 10-5" },
  { href: "/watchlist", label: "自选", d: "M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 17.8l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z" },
  { href: "/market", label: "行情", d: "M3 3v18h18M7 13l3-3 3 3 4-5" },
  { href: "/news", label: "资讯", d: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5" },
  { href: "/member", label: "会员", d: "M4 8l4 3 4-6 4 6 4-3-1.5 10h-13z" },
  { href: "/me", label: "我的", d: "M12 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM5.5 20a6.5 6.5 0 0113 0" },
];

export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 bg-white/95 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((t) => {
          const active = t.href === "/" ? pathname === "/" : pathname.startsWith(t.href);
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors",
                  active ? "text-blue-600 dark:text-blue-400" : "text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300",
                )}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={t.d} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
