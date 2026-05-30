import type { Fund } from "./types";
import { fetchAllFunds } from "./eastmoney";
import { getFunds as getMockFunds } from "./mock-data";

export type DataSource = "live" | "mock";

/**
 * 仪表盘数据入口：优先取天天基金实时数据，失败则回退到演示假数据。
 * 这样接口异常/网络不可达时页面仍可正常展示。
 */
export async function getDashboardFunds(): Promise<{ funds: Fund[]; source: DataSource }> {
  try {
    const funds = await fetchAllFunds();
    if (funds.length > 0) return { funds, source: "live" };
  } catch {
    // 落到下面的兜底
  }
  return { funds: getMockFunds(), source: "mock" };
}
