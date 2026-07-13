import type { Metadata } from "next";
import { MeView } from "@/components/me-view";

export const metadata: Metadata = { title: "我的" };

export default function Page() {
  return <MeView />;
}
