import type { Metadata } from "next";
import { AmvBoard } from "@/components/amv-board";

export const metadata: Metadata = { title: "活跃市值 0AMV" };

// 活跃市值 0AMV 独立板块页（从 /market 入口卡进入）。数据由客户端 /api/amv 拉取并按交易时段轮询。
export default function AmvPage() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <AmvBoard />
    </main>
  );
}
