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
│  ├─ page.tsx              首页（服务端组件，async，export const revalidate=30 ISR）
│  ├─ layout.tsx            根布局（lang=zh-CN、metadata、viewport）
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

## 功能现状

- 默认列表＝**排行榜实时热门**（默认近1年涨幅，UI「热门基金榜」选择器可切维度），**非写死**。
- **搜索任意基金**加入列表（拉完整数据），添加的代码存 `localStorage('fv.added')`，可移除。
- 自选收藏（`fv.watchlist`）、持仓份额（`fv.holdings`）均持久化。
- 「实时估值刷新」开关：每 15s 轮询 `/api/estimate` 拉真实估值（只更新估值、不重绘图表）。

## 开发 / 部署 / Git

- `npm run dev`（开发） / `npm run build`（= Vercel 的构建命令，提交前务必跑通：含 TS 类型检查 + lint）。
- 部署：GitHub 仓库导入 Vercel，零配置；**Vercel 海外区访问国内接口可能慢**，可在 `vercel.json` 设 `regions: ["hkg1"]`（待办）。
- 远程仓库：`github.com/ymx5061004/fund-valuation`（分支 main）。
- **提交身份**：作者用 `ymx5061004 <ymx5061004@163.com>`（本地 git config 已设），保留 `Co-Authored-By: Claude` 标记。别再用 admin@dl-rw.com（会错误归属到 dalianRW 账号）。

## 待办 / 可继续

- `vercel.json` 设香港区并部署；排行榜 A/C 份额去重；预测信号回测；暗色模式手动切换；基金详情独立路由 `/fund/[code]`。
