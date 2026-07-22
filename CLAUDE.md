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
- **盘中估值(estimateNav/estimateChangePct) = 天天基金原始估值(gsz+gszzl)，不要改成相对最新净值重算**（历史上反复改过：45dec8a 曾改为重算 → 23d0cd0 **用户明确要求改回原始估值**——盘中估值是预估值，不应等于/锚定真实净值）。gszzl 相对 gz 自己的 dwjz 计算，可能与最新净值口径有一天偏差，这是接口特性、按原样展示。**当日涨幅 dayChangePct 是另一列**：已结算日用官方确认涨幅（最新两笔净值），未结算的交易日用估值涨幅并标「估」（dayEstimated）。

## 数据来源（天天基金 / 东方财富公开接口，**非官方**）

| 用途 | 接口 |
|---|---|
| 实时估值 | `https://fundgz.1234567.com.cn/js/{code}.js`（JSONP `jsonpgz({...})`：dwjz 净值 / gsz 估值 / gszzl 估值涨跌% / gztime） |
| 历史净值 | `https://fund.eastmoney.com/pingzhongdata/{code}.js`（取 JS 变量 `Data_netWorthTrend`：`{x:ms时间戳, y:净值}`） |
| 搜索 | `https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=` |
| 排行榜 | `https://fund.eastmoney.com/data/rankhandler.aspx?...&sc={维度}`（**需 Referer 头**；CSV 串，[0]=代码 [1]=名称） |

排序维度：`rzdf`今日 / `1yzf`近1月 / `3yzf`近3月 / `1nzf`近1年 / `jnzf`今年来。
⚠️ 接口可能随时变更/限流；**估值仅交易时段（周一~五约 9:30–15:00）更新**；正式商用应换持牌数据源。无可靠的「人气榜」公开接口，所以「热门」用的是**业绩排行榜**口径。

### 抗限流备源（lib/backup-sources.ts，仅主源失败时启用，估值口径仍以天天基金为准）

| 数据 | 主源 | 备源 |
|---|---|---|
| 盘中估值 | fundgz（逐只） | 新浪 `hq.sinajs.cn/list=fu_{code},...`（**一次批量**，字段[2]估值 [3]昨净值 [6]估值涨幅% 语义与 gsz/gszzl 等价） |
| 指数行情 | push2→push2delay | 腾讯 `qt.gtimg.cn/q=sh000001,...`（个别缺失也用它**补齐**；无日经225） |
| 历史净值 | pingzhongdata | 无备源——用进程内 24h 旧值兜底 |
| 指数日K | push2his→push2 | ①腾讯 `web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=sh000001,day,,,900,qfq`（data[sym].day=[日期,开,收,高,低,量(**手**)]；CDN 全球分发 Vercel 可达）→ ②新浪 `quotes.sina.cn .../getKLineData?scale=240`（volume **股÷100=手**；对海外数据中心 IP 实测超时，本机/国内兜底）。均**仅A股+日K、无成交额**→额类指标 UI 检测缺失后隐藏降级。2026-07-22 东财对数据中心 IP 段封 kline 数小时而其余接口正常，备源为此而加 |

- 新浪必须带 `Referer: finance.sina.com.cn`；新浪/腾讯返回 **GBK**，用 `TextDecoder("gb18030")` 解码（数字是 ASCII，解码失败可退化）。
- **腾讯基金估值接口 fundSsgz 已冻结**（数据停在 2023-08，实测确认），勿接入。
- 腾讯指数各市场字段位置不一致，**只用 [3]现价 [4]昨收自行算涨跌**；**东财 `100.NDX` 是纳斯达克综合**（对应腾讯 `usIXIC`，不是 `usNDX` 纳指100，实测踩过）。
- 韧性策略（eastmoney.ts）：估值 fresh 走 `revalidate:15` 短缓存（分钟级数据，no-store 无意义；Next 数据缓存是 SWR 语义，稳态新鲜度上界≈2×revalidate）；同 key 并发去重 `dedup`；`remember/recall` 最近成功值兜底（估值/指数 10min、历史 24h，容量 800 条 FIFO）；历史净值在北京 19~24 点公布时段缓存缩到 5 分钟。
- **估值回退顺序（fetchEstimatesBatch，勿乱改）**：主源 → **90s 内主源旧值** → 新浪批量 → 10min 旧值（主源优先于新浪）。⚠️ 新浪与天天基金是**不同的估算模型**（实测同时刻可差 0.6+ 个百分点），若主源一失败就直接用新浪，间歇限流时估值会每轮轮询来回跳变——所以近期主源旧值排在新浪前，且新浪值存独立的 `est-sina:` 键不污染主源旧值层；「确认无估值」的基金（jsonpgz() 空返回）负缓存 30min 免得常态打新浪。/api/quotes 先整批 fetchEstimatesBatch 再把结果传入 fetchQuoteMetrics（保持新浪一次批量，勿改回逐只内部查）。指数/分时旧值均按条目粒度记忆且只在真实抓到时刷新时间戳（防残缺覆盖完整快照、防旧值被轮询续期永不过期）。

## 目录与关键文件

```
src/
├─ app/
│  ├─ page.tsx              首页 = 持有页（渲染 HoldingsView）
│  ├─ market/page.tsx       行情页（async + revalidate=30 ISR，渲染 FundDashboard）+ loading.tsx 骨架
│  ├─ watchlist/page.tsx    自选页（WatchlistView）
│  ├─ news/page.tsx         资讯页（NewsView：要闻 + 7×24 快讯）
│  ├─ me/page.tsx           我的=设置页（MeView：主题切换/本地数据管理/备份导入导出/关于）
│  ├─ member/page.tsx       占位页（ComingSoon，会员需自建后端暂不做）
│  ├─ fund/[code]/page.tsx  基金详情（generateMetadata 取基金名；非 6 位代码 notFound）
│  ├─ index/[secid]/page.tsx 指数详情（secid 校验 notFound）
│  ├─ layout.tsx            根布局（title template、themeColor、防主题闪烁内联脚本、底部 TabBar）
│  ├─ globals.css           Tailwind v4 + 主题色（.dark class 驱动）+ 中文字体回退
│  ├─ error.tsx / not-found.tsx  全局错误边界 / 404
│  ├─ manifest.ts / robots.ts / icon.png / apple-icon.png  PWA + SEO
│  └─ api/
│     ├─ funds/             GET 全量（真实优先+mock兜底）
│     ├─ estimate/          GET ?codes= 轻量实时估值（轮询用；fundgz revalidate:15 → 90s内主源旧值 → 新浪批量 → 10min旧值；去重+校验+并发池）
│     ├─ quotes/            GET ?codes= 多指标行情（自选/持有/详情用；上游全挂返回 503）
│     ├─ fund/              GET ?code= 单只完整数据（搜索添加用）
│     ├─ search/            GET ?key= 基金搜索（key 截断 32、走 1h 缓存）
│     ├─ popular/           GET ?sort=&limit= 排行榜热门
│     ├─ news/              GET ?tab=list|fast 资讯（要闻分页 / 快讯 sortEnd 翻页）
│     └─ index|indices|kline|constituents/  指数详情/指数条/K线/成分股（secid 格式校验）
├─ lib/
│  ├─ types.ts              领域类型（Fund/NavPoint/Prediction/QuoteMetrics/IndexDetail 等）
│  ├─ eastmoney.ts          ★服务端数据层：估值/历史/搜索/排行/指数/K线（全部走 emFetch 带超时；parseCodes/mapWithLimit/SECID_RE、dedup 去重与 remember/recall 旧值兜底也在这）
│  ├─ backup-sources.ts     备源（新浪批量估值 fu_ / 腾讯指数 qt，GBK 解码；仅主源失败时启用）
│  ├─ news.ts               资讯数据层（东财要闻 getNewsByColumns + 7×24 getFastNewsList）
│  ├─ data.ts               getDashboardFunds：真实数据优先，失败回退 mock
│  ├─ prediction.ts         ★预测「信号引擎」（可替换，见下）
│  ├─ backtest.ts           ★回测（look-ahead 安全：方向命中率 + 信号策略 vs 持有）
│  ├─ amv.ts                活跃市值 0AMV 信号引擎（纯函数：近10日成交额滚动合计≈活跃资金，趋势/真假涨跌/顶底背离，见下）
│  ├─ meihua.ts             梅花易数数字起卦（纯娱乐，代码+目标日确定性起卦，体用生克断次日倾向；**严禁并入 predict 打分**）
│  ├─ mock-data.ts          演示假数据（种子随机，可复现）；TRACKED_FUNDS 兜底代码也在 eastmoney.ts
│  ├─ use-local-storage.ts  SSR 安全的 localStorage 钩子（返回 [value,set,loaded] 三元组）
│  ├─ use-polling.ts        可见性感知轮询钩子 + isAShareTradingTime（隐藏暂停、非交易时段降频）
│  ├─ theme.ts              主题偏好钩子（fv.theme：system/light/dark，配合 layout 防闪烁脚本）
│  └─ utils.ts              cn / 格式化 / 红涨绿跌配色
└─ components/
   ├─ fund-dashboard.tsx    ★行情页编排（'use client'）：选中态/筛选/自选/持仓/实时刷新/热门榜/搜索
   ├─ holdings-view.tsx     持有页（/api/quotes 口径的当日收益，30s 轮询）
   ├─ watchlist-view.tsx    自选页（横向滚动表、三态排序、增量合并防清空）
   ├─ fund-detail.tsx       基金详情（持仓卡/编辑持有/预测+回测/30s 轮询）
   ├─ index-detail.tsx      指数详情（分时/五日/日周月K + 成分股，交易时段感知轮询）
   ├─ index-bar.tsx / index-trend-chart.tsx / kline-chart.tsx  指数条 / 分时图(A股固定241格全天轴) / K线(中文tooltip)
   ├─ news-view.tsx         资讯页（要闻/快讯 Tab、加载更多、快讯 60s 自动刷新）
   ├─ me-view.tsx           设置页（主题三态/数据清除/备份导出导入）
   ├─ fund-list.tsx         列表：PC 表格 / 手机卡片自适应 + ☆收藏
   ├─ fund-search.tsx       搜索框（防抖+防竞态、下拉、点选添加）
   ├─ fund-toolbar.tsx      搜索/类型筛选/排序/只看自选
   ├─ import-sheet.tsx      持仓手动导入/编辑底部弹层
   ├─ nav-chart.tsx         ECharts 净值图（'use client'，ResizeObserver 自适应）
   ├─ prediction-panel.tsx / backtest-panel.tsx  涨跌预测 / 回测面板（含免责声明）
   ├─ amv-board.tsx / amv-strip.tsx  活跃市值 0AMV 独立板块页（/amv，值+日周月+涨跌家数+研判）/ 入口卡（/market，客户端 fetch /api/amv 轮询，点进 /amv）
   ├─ amv-kline-chart.tsx    0AMV 蜡烛图（板块用：主图K线+MA+两市成交额副图；两 grid 固定 left 对齐、副图 0 基线）
   ├─ amv-panel.tsx / amv-trend-chart.tsx / amv-verdict.tsx  单指数 0AMV 面板（指数详情页）/ 双轴折线（面板对比图）/ 共用研判依据+口诀+免责
   ├─ meihua-panel.tsx      周易卦象娱乐面板（本卦/变卦/互卦/体用生克；挂载后起卦防 hydration 不一致；「仅供娱乐」标识勿删）
   ├─ holdings-calculator.tsx 持仓收益估算
   └─ ui/{card,badge}.tsx   基础组件 + SignalBadge
```

## 预测引擎（可替换设计）

`prediction.ts` 的 `predict(fund): Prediction` 是**纯函数**，当前用技术指标（MA5/MA20、近10日动量、RSI14）综合打分给出 看涨/看跌/震荡 + 可解释依据。
**要换 LLM 研判或 ML 模型，只改 `predict` 内部实现、保持签名不变**，页面/组件无需改动。
⚠️ 任何预测**不构成投资建议**，UI 已内置「仅供参考、市场有风险」提示——改动时务必保留。

另有 `meihua.ts` + `MeihuaPanel`（梅花易数卦象，/market 与 /fund/[code] 均已接入）：**纯娱乐定位**（用户明确要求独立面板），数字起卦对同一基金同一预测日确定可复现。它与 predict() 完全隔离——**不得并入综合打分或任何技术信号权重**，面板的「仅供娱乐」徽章与免责文案不可移除。**显隐由 /me「功能」开关控制（`fv.meihua`，用户要求默认关闭）**，两接入点按开关渲染；开关是偏好（同 fv.theme），不进备份导出。

### 活跃市值 0AMV（lib/amv.ts + AmvPanel/AmvStrip，大盘指标）

**用户明确的定义**：统计市场里真正参与交易的浮动资金/筹码（剔除大股东长期不动的「死筹」），是**大盘趋势先行指标**——用于 ①判断大盘趋势/分辨真假涨跌 ②辨别放量上涨是真行情还是诱多 ③顶/底背离识别牛熊拐点 ④资金进出强弱。**不是**持仓页的「今日活跃持仓市值」（曾误实现过一次，已回退，勿再犯）。
- **实现口径**：拿不到全市场逐股浮动筹码数据，用**指数近 10 日成交额滚动合计**作活跃资金代理（死筹不产生成交额）。数据来自东财日 K `f57` 成交额（`fetchKline` fields2 已含 f57，`KlineCandle.amount` 可选——个别海外指数缺失）。
- 纯函数、look-ahead 安全：`computeAmvSeries`（滚动合计）+ `analyzeAmv`（近5日趋势 / 近20日指数-AMV 同步象限 / 近30vs前30日极值背离）。**盘中要先 `dropUnfinishedToday(candles, secid)` 剔除未收盘当日 K 线**（当日成交额不完整会让末点失真下坠）——按 secid 所属市场收盘时间判定（A 股 15:00 / 港股 16:00 / 日经北京 14:00；未识别市场交易日内一律剔除当日），**必须传 secid**（早期只处理 A 股，港股/日经盘中会误报信号）。东财 kline 在 `beg=0` 时**忽略 lmt 返回 1990 至今全量(~8600 点 ≈880KB)**，面板算 AMV 前 `slice(-160)` 截尾（否则默认视图跨 36 年、近期趋势被压平）；且**全量包在 emFetch 3s 超时内经常传不完**——线上深市 kline 因此从未成功过（实测 prod `candle:[]`、板块长期 sh-only/冷启动 503），所以 `buildAmvBoard` 必须给 `fetchKline` 传**有界 beg**（今天−1250 自然日，YYYYMMDD，只回几十 KB），beg 也参与旧值兜底 cacheKey 防止有界/全量互相污染。/api/kline 的日/周/月 K 图沿用全量 beg=0（历史行为，勿动）。
- 接入点：
  - **独立板块 `/amv`（AmvBoard，主入口，参考指南针 0AMV 板块）**：值+日涨跌 / 日周月走势 / 今日实时两市成交额 / 涨跌家数 / 研判。数据 `buildAmvBoard()`（eastmoney.ts，**两市＝沪指+深成指成交额合计**作活跃资金、沪指做参考指数与剔除口径；深市 K 线整体抓不到时退化为仅沪市并置 `coverage:"sh-only"`，UI 注明「仅沪市（深市暂缺）」不静默冒充两市；另有**板级旧值兜底**——整板失败/样本不足回 24h 内旧板（日频数据，封禁期供昨日板远好于 503）、仅沪市降级板让位给 10min 内完整两市板，防冷实例 503 与「两市↔仅沪市」轮询跳变）→ `/api/amv`(revalidate 15) → 客户端交易时段 30s 轮询。入口＝`/market` 顶部 `AmvStrip` **客户端**入口卡（fetch `/api/amv` + 60s 轮询、与板块同口径 buildAmvBoard，点进 `/amv`；数据未就绪/失败整条隐藏）。图表组件均按**数据签名门控 setOption**，轮询同值不重绘（保留用户缩放）；`AmvTrendChart` 的 `indexLabel` prop 让单指数面板不误标「沪指点位」。
  - 指数详情 `/index/[secid]` 的 `AmvPanel`：单个指数视角的活跃市值（自取该指数日 K），与大盘板块并存。
- **数据保真度（用户已明确 2026-07-21）**：指南针的 0AMV 是专有合成指数（逐股实时活跃度、有自己盘中逐笔 OHLC），公开接口拿不到其原始序列/公式。本项目是**公开成交额估算版**，**数值不等同指南针**——`AmvVerdict estimateNote` 已注明，勿去掉该说明。**板块蜡烛口径（用户 2026-07-22 两轮确认：要真影线 K 线，同意换模型）**：活跃筹码市值指数＝近10日两市成交量合计（活跃筹码代理，死筹不换手）× 沪指当日 开/高/低/收 ÷ `AMV_INDEX_SCALE`(1e8 定标，落在十万点量级)——沪指有真实盘中 OHLC → 日K 有真影线/跳空；周/月K=日蜡烛聚合，**首组一律丢弃**（750 根截尾多落在周期中间，残缺组失真）；分时/五日仍不做。头部数值=指数点数（非金额），「10日额/今日额」万亿口径作副指标；`AmvPanel`（单指数面板）仍是成交额滚动合计的折线口径。图下蜡烛口径注释勿删。
- 共用组件：`AmvKlineChart`(板块蜡烛图：主图K线点数轴+MA5/10/20+两市成交额副图，红涨绿跌)、`AmvTrendChart`(双轴折线，单指数面板对比图用)、`AmvVerdict`(依据+口诀+免责，estimateNote 区分板块指数口径/面板成交额口径文案)。`computeAmvIndex` 日K→真OHLC指数蜡烛+研判序列、`aggregateAmvCandles` 日蜡烛→周/月蜡烛（`periodKey` 分组）。
- 与 predict()/meihua 相互独立，不并入基金打分；免责声明（「勿单独作为买卖依据/不构成投资建议」）不可删。仅反映短线活跃资金，长线锁筹品种参考意义有限。

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
  **盘中估值 = 天天基金原始估值(gsz 估值净值 + gszzl 估值涨幅)**（23d0cd0 用户明确，是预估值、与当日确认涨幅区分），始终显示（`estimateFresh`=有估值数据；仅无估值数据时显示「--」）。
- **/fund/[code]（基金详情）** = `FundDetail`（全屏，`/fund/` 下隐藏底部 TabBar，有自己的底部操作栏）。取 `/api/fund`(净值历史) + `/api/quotes`(指标)。头部：名称 + 当日涨幅(带「估」) + 最新净值 + 近一年；区间收益(本周/本月/今年/近一年)；净值走势图(NavChart `zoomStart=0`)+周期(近1月/3月/6月/1年)；净值历史表(日期/净值/日涨幅)；底部「加/删自选」+「添加持有」(ImportSheet 的 `presetFund` 预选本基金)。
- **/news（资讯）** = `NewsView`。要闻（`np-listapi` column=350，分页「加载更多」）+ 7×24 快讯（`np-weblist` getFastNewsList，sortEnd 翻页、60s 自动刷新、titleColor>0 标红）双 Tab；数据层在 `lib/news.ts`，走 `/api/news` 代理；点击外链新窗口打开东财原文。
- **/me（我的）** = `MeView` 设置页。外观三态切换（跟随系统/浅色/深色，存 `fv.theme`，暗色为 `.dark` class 驱动 + layout 防闪烁内联脚本，**别改回 media 查询方案**）；功能开关（梅花易数卦象 `fv.meihua`，默认关闭）；本地数据管理（4 个 fv.* 的条数展示/分项清除/JSON 备份导出导入）；关于与免责声明。
- **/member** = 占位页（`ComingSoon`）。会员体系需自建后端，公开接口帮不上，暂不做。

> ⚠️ **涨跌预测 + 历史回测是「保留功能」，后续还要用**（现位于 /market 行情页与 /fund/[code] 详情页）。重构或调整布局时**切勿删除** `prediction.ts` / `backtest.ts` / `PredictionPanel` / `BacktestPanel`，也不要把它们从 /market 里移除。

## 开发 / 部署 / Git

- `npm run dev`（开发） / `npm run build`（= Vercel 的构建命令，提交前务必跑通：含 TS 类型检查 + lint）。
- 部署：GitHub 仓库导入 Vercel；`vercel.json` 设 `regions: ["sin1"]`（原 hkg1 就近访问国内接口，2026-07-22 东财对 hkg1 出口 IP 的 kline 接口封禁数小时、其余接口正常，切 sin1 换出口 IP 池绕开；若 sin1 也被封可再切 hnd1/icn1，勿只盯一个区）。
- 远程仓库：`github.com/ymx5061004/fund-valuation`（分支 main）。
- **提交身份**：作者用 `ymx5061004 <ymx5061004@163.com>`（本地 git config 已设），保留 `Co-Authored-By: Claude` 标记。别再用 admin@dl-rw.com（会错误归属到 dalianRW 账号）。

## 待办 / 可继续

- /member 会员页（需自建后端，或降级为「工具」Tab：定投/摊薄计算器）。
- 活跃市值 0AMV 的板块/个股维度筛选（用户定义里的第 4 用途）：需全市场逐股/逐板块成交额数据，公开接口可用 push2 板块行情探索，暂只做了指数维度。
- 持仓截图 OCR 导入（ImportSheet 已留占位 Tab，用户暂定先不接）。
- 自选列表拖拽排序/置顶（现有 自选顺序/涨幅升降 三态排序）。
- 指数详情页「相关指数基金」联动（secid → 跟踪基金，可用 searchFunds 或静态映射）。
- ECharts 图表跟随 .dark 主题重绘（当前用中性色两种主题下均可读，tooltip 始终浅底）。
- 手动切换主题时用 JS 同步 <meta name="theme-color">（现只跟系统偏好）。
