import type { Metadata } from "next";
import { getDashboardFunds } from "@/lib/data";
import { FundDashboard } from "@/components/fund-dashboard";
import { IndexBar } from "@/components/index-bar";
import { AmvStrip } from "@/components/amv-strip";

export const metadata: Metadata = { title: "行情" };

// 行情 Tab：大盘指数 + 热门榜 + 涨跌预测仪表盘
export const revalidate = 30;

export default async function MarketPage() {
  const { funds, source } = await getDashboardFunds();
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6">
        <IndexBar />
        <AmvStrip />
      </div>
      <FundDashboard funds={funds} source={source} />
    </main>
  );
}
