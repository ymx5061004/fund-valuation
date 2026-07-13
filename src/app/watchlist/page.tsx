import type { Metadata } from "next";
import { WatchlistView } from "@/components/watchlist-view";

export const metadata: Metadata = { title: "自选" };

// 自选 Tab
export default function Page() {
  return <WatchlistView />;
}
