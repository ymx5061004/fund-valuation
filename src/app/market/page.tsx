import { getDashboardFunds } from "@/lib/data";
import { FundDashboard } from "@/components/fund-dashboard";

// 行情 Tab：原热门榜 + 涨跌预测仪表盘
export const revalidate = 30;

export default async function MarketPage() {
  const { funds, source } = await getDashboardFunds();
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <FundDashboard funds={funds} source={source} />
    </main>
  );
}
