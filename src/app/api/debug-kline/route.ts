import { NextResponse } from "next/server";

// ⚠️ 临时诊断路由（定位 2026-07-22 线上 kline 全挂：区分「hkg1 被限流」vs「新 fields2 参数被拒」）。
// 用完即删；?k= 简单防路人误触发（无敏感数据，仅上游连通性探测）。
export async function GET(request: Request) {
  const sp = new URL(request.url).searchParams;
  if (sp.get("k") !== "amv0722") return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    Referer: "https://quote.eastmoney.com/",
  };
  const variants = [
    { name: "push2his-old", host: "push2his.eastmoney.com", fields: "f51,f52,f53,f54,f55,f57" },
    { name: "push2his-new", host: "push2his.eastmoney.com", fields: "f51,f52,f53,f54,f55,f56,f57" },
    { name: "push2-old", host: "push2.eastmoney.com", fields: "f51,f52,f53,f54,f55,f57" },
    { name: "push2-new", host: "push2.eastmoney.com", fields: "f51,f52,f53,f54,f55,f56,f57" },
  ];
  const results = await Promise.all(
    variants.map(async (v) => {
      const url = `https://${v.host}/api/qt/stock/kline/get?secid=1.000001&klt=101&fqt=0&beg=20260701&end=20500101&lmt=20&fields1=f1&fields2=${v.fields}`;
      const t0 = Date.now();
      try {
        const res = await fetch(url, { headers: HEADERS, cache: "no-store", signal: AbortSignal.timeout(5000) });
        const text = await res.text();
        const klines = (JSON.parse(text) as { data?: { klines?: string[] } }).data?.klines;
        return {
          name: v.name,
          status: res.status,
          ms: Date.now() - t0,
          klineCount: klines?.length ?? 0,
          lastKline: klines?.[klines.length - 1] ?? null,
        };
      } catch (e) {
        return { name: v.name, status: 0, ms: Date.now() - t0, error: String(e).slice(0, 120) };
      }
    }),
  );
  return NextResponse.json({ at: new Date().toISOString(), results });
}
