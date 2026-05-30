# 基金估值与涨跌预测系统

盘中实时估值 + 基于技术指标的涨跌方向研判，一套代码自适应**手机与电脑浏览器**，可**一键部署到 Vercel**。

> ⚠️ 当前为演示版：基金数据为程序生成的**虚构数据**；涨跌预测基于历史净值的技术指标推算，**仅供参考，不构成投资建议**。基金有风险，投资需谨慎。

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router）+ React 19 |
| 语言 | TypeScript（严格模式） |
| 样式 | Tailwind CSS v4，响应式断点 |
| 图表 | Apache ECharts（净值/估值曲线 + 均线） |
| 部署 | Vercel（零配置） |

## 本地运行

```bash
npm install
npm run dev
# 打开 http://localhost:3000
```

构建生产版本：

```bash
npm run build
npm start
```

## 部署到 Vercel

**方式一：连接 Git 仓库（推荐）**

1. 把本项目推到 GitHub / GitLab / Gitee：
   ```bash
   git remote add origin <你的仓库地址>
   git push -u origin main
   ```
2. 打开 [vercel.com](https://vercel.com) → New Project → 导入该仓库。
3. Vercel 会自动识别为 Next.js 项目，**无需任何配置**，点击 Deploy 即可。
4. 之后每次 `git push` 都会自动重新部署。

**方式二：命令行直接部署**

```bash
npm i -g vercel
vercel        # 首次会引导登录与项目配置
vercel --prod # 部署到生产环境
```

## 目录结构

```
src/
├── app/
│   ├── layout.tsx        # 根布局：中文 metadata、移动端 viewport
│   ├── page.tsx          # 首页（服务端组件，生成数据 → 传给仪表盘）
│   └── globals.css       # Tailwind v4 + 主题色 + 中文字体回退
├── components/
│   ├── ui/               # 基础组件（Card、Badge、SignalBadge）
│   ├── fund-dashboard.tsx# 仪表盘（客户端，含选中状态与统计）
│   ├── fund-list.tsx     # 基金列表（PC 表格 / 手机卡片自适应）
│   ├── nav-chart.tsx     # ECharts 净值图（客户端，容器自适应）
│   └── prediction-panel.tsx # 涨跌预测面板
└── lib/
    ├── types.ts          # 领域类型
    ├── mock-data.ts      # 演示假数据（可复现）
    ├── prediction.ts     # ⭐ 预测「信号引擎」（可替换）
    └── utils.ts          # cn / 格式化 / 红涨绿跌配色
```

## 接入真实数据与模型

项目按「可替换」原则设计，从演示版升级到生产只需替换两处：

1. **真实基金数据** —— 改写 `src/lib/mock-data.ts` 的 `getFunds()`，
   改为调用真实接口（如第三方行情/自建数据服务）并返回相同的 `Fund[]` 结构。
   可把 `page.tsx` 的 `Home` 改成 `async` 直接 `await` 接口。

2. **预测模型** —— 替换 `src/lib/prediction.ts` 中 `predict(fund)` 的内部实现，
   保持函数签名不变即可。当前为技术指标（MA/动量/RSI），后续可换成：
   - **LLM 研判**：把近期净值与新闻喂给大模型 API，返回方向与理由；
   - **机器学习模型**：用 XGBoost / LSTM 等离线训练后在线推断。

## 响应式说明

- 移动端：`<meta viewport>` 已在 `layout.tsx` 声明；基金列表自动从表格切换为卡片。
- 布局：概览卡片手机 2 列 / PC 4 列；详情区手机上下堆叠 / PC 三栏。
- 图表：ECharts 通过 `ResizeObserver` 跟随容器宽度自适应。

## 合规提醒

向用户提供「涨跌预测 / 投资建议」在国内涉及基金投顾、销售相关资质监管。
正式对外运营前请确认合规边界，并在显著位置保留风险提示（本项目已内置）。
