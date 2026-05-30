import { getFunds } from "@/lib/mock-data";
import { FundDashboard } from "@/components/fund-dashboard";

// 服务端组件：在服务端生成数据并以 props 传给客户端仪表盘，避免注水不一致。
// 接入真实数据时，把 getFunds() 换成数据库/接口查询即可（可改为 async）。
export default function Home() {
  const funds = getFunds();
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <FundDashboard funds={funds} />
    </main>
  );
}
