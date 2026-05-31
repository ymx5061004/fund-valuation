@AGENTS.md

# 基金估值与涨跌预测系统

面向投资者的网页应用：展示基金**盘中实时估值**、**净值走势图**、基于技术指标的**涨跌方向研判**。
**单人 + 全程 AI 开发**；一套响应式代码自适应手机与电脑；可直接部署到 Vercel；数据来自天天基金公开接口。

## 技术栈

- **Next.js 16**（App Router）+ **React 19**（先读 `@AGENTS.md`，版本较新，写代码前查 `node_modules/next/dist/docs/`）
- **TypeScript** 严格模式，`tsconfig` **target = ES2017**
- **Tailwind v4**：配置写在 `src/app/globals.css` 的 `@theme`，**没有 tailwind.config.js**
- **Apache ECharts**（净值/估值图）。**未用 shadcn**，UI 组件手写在 `src/components/ui`
- 部署 **Vercel**（零配置）

## ⚠️ 易踩坑（避免重蹈覆辙）

- **正则别用 `/.../s`（dotAll）标志**——target ES2017 会编译报错，改用 `[\s\S]`。
- **配色遵循 A 股「红涨绿跌」**：涨=红、跌=绿（见 `utils.ts` 的 `changeColor`、`ui/badge.tsx`）。别按欧美红跌绿涨。
- **天天基金接口只能在服务端调**（有 CORS + JSONP/JS 格式），全部集中在 `src/lib/eastmoney.ts`；客户端一律走 `/api/*` 代理。
- **避免 hydration 不一致**：服务端组件生成数据传 props；localStorage 状态（自选/持仓/已添加）首屏用默认值、`useEffect` 挂载后再读（见 `use-local-storage.ts`）。`mock-data.ts` 用种子随机保证可复现。
- **本机验证接口需联网**（东方财富/天天基金是国内站点）。
- **dev 端口**：旧 `next dev` 进程没杀干净会占用 3000，新进程跳到 3001 并退出；构建/重启前先释放 3000。
- **dev 异常 404**：反复 build/dev 切换可能让 `.next` 缓存错乱、已有路由全 404；`rm -rf .next` 重启即可。
- **「最新净值」统一取历史净值(pingzhongdata)最新点**（`buildFund`/`fetchQuoteMetrics` 用 `lastNav`）；**不要用 gz 接口的 `dwjz`**（会滞后一天，导致行情/自选/历史口径对不上）。行情实时轮询也不覆盖 nav。
- **估值涨幅(estimateChangePct) = 估值相对「最新净值」重算**(`(estimateNav-lastNav)/lastNav`)，**不要直接用 gz 的 gszzl**：gszzl 相对 gz 自己的 dwjz(可能滞后一天)，会出现「估值>最新净值却显示负涨幅」的符号矛盾(用户看到会觉得错)。重算后 估值/净值/涨幅 三者自洽；交易时段 dwjz=最新净值，重算≈gszzl。（注：当日涨幅 dayChangePct 仍是确认涨幅，与盘中估值是两个不同列。）

## 数据来源（天天基金 / 东方财富公开接口，**非官方**）

| 用途 | 接口 |
|---|---|
| 实时估值 | `https://fundgz.1234567.com.cn/js/{code}.js`（JSONP `jsonpgz({...})`：dwjz 净值 / gsz 估值 / gszzl 估值涨跌% / gztime） |
| 历史净值 | `https://fund.eastmoney.com/pingzhongdata/{code}.js`（取 JS 变量 `Data_netWorthTrend`：`{x:ms时间戳, y:净值}`） |
| 搜索 | `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=` |
| 排行榜 | `https://fund.eastmoney.com/data/rankhandler.aspx?...&sc={维度}`（**需 Referer 头**；CSV 串，[0]=代码 [1]=名称） |

排序维度：`rzdf`今日 / `1yzf`近1月 / `3yzf`近3月 / `1nzf`近1年 / `jnzf`今年来。
⚠️ 接口可能随时变更/限流；**估值仅交易时段（周一~五约 9:30–15:00）更新**；正式商用应换持牌数据源。无可靠的「人气榜」公开接口，所以「热门」用的是**业绩排行榜**口径。

## 目录与关键文件

```
src/
├─ app/
│  ├─ page.tsx              首页 = 持有页（渲染 HoldingsView）
│  ├─ market/page.tsx       行情页（async + revalidate=30 ISR，渲染 FundDashboard）
│  ├─ watchlist|news|member|me/page.tsx  占位页（ComingSoon）
│  ├─ layout.tsx            根布局（lang=zh-CN、metadata、viewport、底部 TabBar）
│  ├─ globals.css           Tailwind v4 + 主题色 + 中文字体回退
│  └─ api/
│     ├─ funds/             GET 全量（真实优先+mock兜底）
│     ├─ estimate/          GET ?codes= 轻量实时估值（供客户端轮询，no-store）
│     ├─ fund/              GET ?code= 单只完整数据（搜索添加用）
│     ├─ search/            GET ?key= 基金搜索
│     └─ popular/           GET ?sort=&limit= 排行榜热门
├─ lib/
│  ├─ types.ts              领域类型（Fund/NavPoint/Prediction/FundMeta/RankSort 等）
│  ├─ eastmoney.ts          ★服务端数据层：实时估值/历史/搜索/排行榜抓取与解析
│  ├─ data.ts               getDashboardFunds：真实数据优先，失败回退 mock
│  ├─ prediction.ts         ★预测「信号引擎」（可替换，见下）
│  ├─ backtest.ts           ★回测（look-ahead 安全：方向命中率 + 信号策略 vs 持有）
│  ├─ mock-data.ts          演示假数据（种子随机，可复现）；TRACKED_FUNDS 兜底代码也在 eastmoney.ts
│  ├─ use-local-storage.ts  SSR 安全的 localStorage 钩子
│  └─ utils.ts              cn / 格式化 / 红涨绿跌配色
└─ components/
   ├─ fund-dashboard.tsx    ★编排（'use client'）：选中态/筛选/自选/持仓/实时刷新/热门榜/搜索
   ├─ fund-list.tsx         列表：PC 表格 / 手机卡片自适应 + ☆收藏
   ├─ fund-search.tsx       搜索框（防抖、下拉、点选添加）
   ├─ fund-toolbar.tsx      搜索/类型筛选/排序/只看自选
   ├─ nav-chart.tsx         ECharts 净值图（'use client'，ResizeObserver 自适应）
   ├─ prediction-panel.tsx  涨跌预测面板（含免责声明）
   ├─ holdings-calculator.tsx 持仓收益估算
   └─ ui/{card,badge}.tsx   基础组件 + SignalBadge
```

## 预测引擎（可替换设计）

`prediction.ts` 的 `predict(fund): Prediction` 是**纯函数**，当前用技术指标（MA5/MA20、近10日动量、RSI14）综合打分给出 看涨/看跌/震荡 + 可解释依据。
**要换 LLM 研判或 ML 模型，只改 `predict` 内部实现、保持签名不变**，页面/组件无需改动。
⚠️ 任何预测**不构成投资建议**，UI 已内置「仅供参考、市场有风险」提示——改动时务必保留。

## 应用结构与功能现状（底部 Tab 布局，养基宝风格）

`TabBar`（components/tab-bar.tsx）按路由高亮：持有 / 自选 / 行情 / 资讯 / 会员 / 我的。

- **/（持有）** = 持仓记账首页（`HoldingsView`）。账户资产 / 当日收益 / 持有收益 + 持仓表 + 导入。
  持仓存 `localStorage('fv.positions')` = `[{code,name,shares,cost}]`；当日收益用 `/api/estimate` 实时估值算、持有收益用成本算。
  导入用 `ImportSheet`：**手动导入已实现**（复用 `FundSearch` 选基金 + 填份额/成本，可编辑/删除）；**截图导入仅占位**（OCR 待接，用户暂定先不接）。
- **/market（行情）** = 原「热门榜 + 涨跌预测」仪表盘（`FundDashboard`）。默认列表＝排行榜实时热门（近1年，UI「热门基金榜」可切维度），**A/C 份额已去重**；可搜索添加任意基金（`fv.added`）；自选 `fv.watchlist`、计算器份额 `fv.holdings`；「实时估值刷新」每 15s 轮询 `/api/estimate`；含**涨跌预测**(prediction.ts) 与**历史回测**(backtest.ts，look-ahead 安全 → `BacktestPanel`)。
- **/watchlist（自选）** = `WatchlistView`。读写 `localStorage('fv.watchlist')`（与 /market 的 ★ 同步）。
  **横向滚动表格**：名称列 sticky 固定，指标列右滑——当日涨幅(确认涨幅+净值，堆叠) / 盘中估值(估算涨幅+估算净值，堆叠) / 本周 / 本月 / 今年 / 近一年。
  数据走 **`/api/quotes`**（`fetchQuoteMetrics`：周/月/今年/近一年按历史净值相对最新净值日计算；**当日涨幅 `dayChangePct`**=当「估值日(gztime)=今天且新于最新净值日」(今日净值未公布)时用估值涨幅并置 `dayEstimated=true`(UI 显示小「估」)、否则用最新两笔净值的官方确认涨幅 —— 已与养基宝截图逐项对齐)，每 30s 刷新；可搜索添加、点 ★ 移除、按当日涨幅排序、**点行进入 /fund/[code] 详情**。
  注：「关联板块」「重仓均涨幅」需养基宝自建数据，天天基金接口拿不到，未做（第二列改显盘中估值）。
  **盘中估值 = 估值净值 + 估值相对最新净值的涨跌(重算)**，始终显示（`estimateFresh`=有估值数据；仅无估值数据时显示「--」）。
- **/fund/[code]（基金详情）** = `FundDetail`（全屏，`/fund/` 下隐藏底部 TabBar，有自己的底部操作栏）。取 `/api/fund`(净值历史) + `/api/quotes`(指标)。头部：名称 + 当日涨幅(带「估」) + 最新净值 + 近一年；区间收益(本周/本月/今年/近一年)；净值走势图(NavChart `zoomStart=0`)+周期(近1月/3月/6月/1年)；净值历史表(日期/净值/日涨幅)；底部「加/删自选」+「添加持有」(ImportSheet 的 `presetFund` 预选本基金)。
- **/news /member /me** = 占位页（`ComingSoon`），待做。

> ⚠️ **涨跌预测 + 历史回测是「保留功能」，后续还要用**（现位于 /market 行情页）。重构或调整布局时**切勿删除** `prediction.ts` / `backtest.ts` / `PredictionPanel` / `BacktestPanel`，也不要把它们从 /market 里移除。

## 开发 / 部署 / Git

- `npm run dev`（开发） / `npm run build`（= Vercel 的构建命令，提交前务必跑通：含 TS 类型检查 + lint）。
- 部署：GitHub 仓库导入 Vercel，零配置；**Vercel 海外区访问国内接口可能慢**，可在 `vercel.json` 设 `regions: ["hkg1"]`（待办）。
- 远程仓库：`github.com/ymx5061004/fund-valuation`（分支 main）。
- **提交身份**：作者用 `ymx5061004 <ymx5061004@163.com>`（本地 git config 已设），保留 `Co-Authored-By: Claude` 标记。别再用 admin@dl-rw.com（会错误归属到 dalianRW 账号）。

## 待办 / 可继续

- `vercel.json` 设香港区并部署；排行榜 A/C 份额去重；预测信号回测；暗色模式手动切换；基金详情独立路由 `/fund/[code]`。
