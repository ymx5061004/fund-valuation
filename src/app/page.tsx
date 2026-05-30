import { getDashboardFunds } from "@/lib/data";
import { FundDashboard } from "@/components/fund-dashboard";

// 每 30 秒最多回源一次（ISR）。实时估值在交易时段约每分钟更新，30s 足够新鲜。
export const revalidate = 30;

export default async function Home() {
  const { funds, source } = await getDashboardFunds();
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <FundDashboard funds={funds} source={source} />
    </main>
  );
}
