# dsh-sport-health

DeepSeek Harness 插件：把 [`sport-health-mcp-server`](https://github.com/leishu/sport-health-mcp-server) 的跑步数据以**图表**形式呈现在 Harness 里。

技术栈：Vue 3 + Element Plus 2 + ECharts 6（Vite 构建）。

- **20 个工具卡片**：每次模型调用 `mcp__sport_health__*` 工具，结果都会渲染成对应的图表卡片，而不是一大段 JSON。
- **“运动健康”会话视图**：一个独立标签页，直接从 MCP 服务拉取快照，展示跑量、训练类型、连续性、ACWR 负荷、个人最佳和近期跑步。
- **只读看板接口**：host 半在 `/sport-health/api/*` 暴露同源只读 JSON，不转发任意 MCP 工具，也不提供写入入口。

## 预览

不启动 Harness、不调用模型，也可以看全部图表：

```bash
npm install
npm run build
npm run preview
# 打开 http://127.0.0.1:3100/preview/
```

预览页用 `tests/fixtures/` 中**真实 MCP 返回**渲染 20 个 toolview，并加载 `tests/fixtures/api-overview.json` 渲染看板视图。它只是开发工具，不参与 Harness 运行时。

## 架构

这个包同时是一个 **bundle** 和一个 **双半插件**：

```
dsh-sport-health
├─ cordis.patch.yml          挂载 MCP client + 本插件 host 半
├─ vite.config.ts            双模式构建（client UMD / host ESM）
├─ src/host/                 Node 半：MCP HTTP 客户端 + /sport-health/api
└─ src/client/               浏览器半：Vue 3 组件（toolview + 看板）
   ├─ index.ts              注册 20 个 toolview 和 1 个 conversation.view
   ├─ lib/                  载荷解析、格式化、主题变量、ECharts option 构造
   └─ components/
      ├─ ToolCard.vue       卡片外壳（标题、状态、失败态、原始 JSON）
      ├─ ToolViews.vue      20 个工具视图，按工具名分派
      ├─ Dashboard.vue      “运动健康”独立视图
      ├─ EChart.vue         ECharts 容器（按需引入 + 尺寸/主题自适应）
      ├─ Chart.vue          line / bar / donut / gauge 封装
      ├─ BarList.vue        横向条形列表
      ├─ Heatmap.vue        训练日历热力图
      ├─ RouteMap.vue       GPS 轨迹折线
      ├─ Kit.vue            ShPanel 卡片 + ShKpi 指标瓦片
      └─ ThemeProvider.vue  明暗主题切换、CSS 变量注入
```

### 数据流

```
模型调用工具
  └─ dsh-mcp-client ──streamable-http──> sport-health-mcp-server:8080
       └─ tool result (text/JSON)
            └─ tool.call.toolview ──> 图表卡片

“运动健康”视图
  └─ fetch /sport-health/api/overview
       └─ host 半 (McpHttpClient) ──> sport-health-mcp-server:8080
```

- 工具卡片直接解析 MCP 结果里的 text JSON，不需要额外的 host 往返。
- 看板走同源相对路径；Web 和桌面端（`dsh-app://app`）都会把应用请求转发给 Host，因此不需要绝对 URL 或 token。
- 技术栈：**Vue 3**（`<script setup>`）+ **Element Plus 2** + **ECharts 6**。三者都打包进 `lib/client.js`；ECharts 按需引入用到的图表类型与组件以控制体积。
- Element Plus 只有浅色主题，因此 `ThemeProvider.vue` 在 `[data-theme="dark"]` / `prefers-color-scheme: dark` 下重新声明 `--el-*` 变量，并注入一套 `--sh-*` 自定义变量供卡片和图表共用。

### React 插槽 ⇄ Vue 组件：桥接层

DSH 的 slot 渲染器按 **React 元素**挂载条目（renderer 的 `renderEntry()` 就是 `jsx(Comp, {...kit, ...ownerProps})`），所以注册进去的必须是 React 组件，并且**返回 React 元素**。`src/client/lib/mount.ts` 负责桥接，Vue 一行不用改：

```ts
// 1. 返回一个普通 React <div>，React 只持有这个空容器
return React.createElement('div', { ref: containerRef, style: { display: 'contents' } })

// 2. 在 useEffect 里让 Vue 接管容器内部
React.useEffect(() => {
  const app = createApp({ render: () => h(ElConfigProvider, { locale: zhCn }, () => h(VueComponent, { ...props })) })
  app.mount(containerRef.current)
  return () => app.unmount()          // 3. 卸载时清理
}, [])
```

要点：

- **React 不打包**，从 bundle 工厂的 `require('react')` 取宿主那一份。元素必须由同一 React 实例创建，否则 hooks 直接炸。
- **require 只在物化阶段有效**。shell 用 `factory(require)` 物化 bundle，`apply(ctx)` 是之后由 cordis 单独调用的，那时 `ctx` 里**没有** `require`（只有 `inject` 声明的服务）。所以 `src/client/index.ts` 在**模块顶层**调 `captureShellReact()`，把这个 `require` 存进模块作用域——那是唯一的同步窗口。
- 模块体里的 `require` 由打包器注入：`vite.config.ts` 的 `moduleLoader()` 在工厂体里写一行 `var __dsh_require__ = require;`，`react` 被设为 rollup external 并映射到该标识符（否则 UMD 包装层会去找一个不存在的全局 `require`）。
- owner props 每次 React 渲染写进一个 `reactive` 对象，Vue 侧响应式更新，**不重新挂载**（工具阶段 `start` → `result` 只更新 props）。
- 容器用 `display: contents` 不参与布局，grid/flex 父级看到的是 Vue 自己的子节点。
- Element Plus 的 popover/tooltip 会 teleport 到 `body`，这是正常的，样式已在 `theme.ts` 里处理。

> **踩过的坑 1**：适配器曾把 `render()` 改成直接返回 `document.createElement('div')`，React 把它当子节点 → `Minified React error #31 (Objects are not valid as a React child)` → `SlotErrorBoundary` 把整个 `conversation.view` 降级成空锚点，页面全白。`npm test` 的 `slot entries are React components` 用例守这条约束，`preview/preview.js` 与 `tests/render.mjs` 也改成按 `jsx(Comp, props)` 派发，否则这类问题在预览里永远看不见。

> **踩过的坑 2**：改成桥接后曾一度 `apply(ctx)` 里调 `setHostRequire(ctx.require)`，而 shell 从不注入这个字段 → React 捕获静默失败 → 加载时报 `web boot: 1 entry did not activate / dsh-sport-health: failed`（组件要渲染时才抛「no React runtime」，所以错误信息指向了完全无关的「没激活」）。`tests/render.mjs` 现在断言 `factory` 期间必须出现 `require('react')` 调用，且 `ctx` 里**故意不放** `require`，模拟真实时序。

## 环境要求

| 组件 | 要求 |
| --- | --- |
| DeepSeek Harness | `>=0.2.0 <0.3.0` |
| Node.js | 20+（构建与测试） |
| sport-health MCP 服务 | 默认 `http://127.0.0.1:8080/mcp` |
| 启动 MCP 服务 | JDK 21 |

## 快速开始

### 1. 启动 sport-health MCP 服务

在 `sport-health-mcp-server` 仓库目录下：

```bash
mvn -DskipTests package
JAVA_HOME=/path/to/jdk-21 /path/to/jdk-21/bin/java \
  -jar target/sport-health-mcp-server-1.0.0.jar
```

确认服务在线：

```bash
curl http://127.0.0.1:8080/actuator/health
```

### 2. 构建插件

在本仓库目录下：

```bash
npm install
npm run build
```

产物：

- `lib/index.js`：host 半（ESM）
- `lib/client.js`：浏览器半（UMD，构建时自动包裹成 `window.__ModuleLoader__.load({ id, factory })` 自注册模块）

> **没有 `lib/client.css`**：Harness 只请求 bundle 的 JS 入口，旁的 CSS 文件不会被加载。所以构建时把抽取出的样式表内联进 `client.js`，在模块求值时去重插入一个 `<style data-plugin-css="dsh-sport-health">`（约 94 kB）。`ensureThemeVars()` 随后再注入一套运行时主题变量，两者互不影响。

### 3. 安装到 DSH profile

```bash
# 本地路径安装（会写入 profile 的 bundle 列表）
dsh plugin --profile desktop add /absolute/path/to/dsh-sport-health

# 或者复制一份 profile 做隔离测试
DSH_HOME=/tmp/dsh-test-home dsh --profile test --from-default-profile web
DSH_HOME=/tmp/dsh-test-home dsh plugin --profile test add /absolute/path/to/dsh-sport-health
DSH_HOME=/tmp/dsh-test-home dsh --profile test --no-open --port 3099
```

安装后 `cordis.patch.yml` 会自动加入两层：

1. `@deepseek-ai/dsh-mcp-client`：连接 `http://127.0.0.1:8080/mcp`，`serverName: sport_health`，模型看到 `mcp__sport_health__<tool>`。
2. `dsh-sport-health`：本插件 host 半，挂载 `/sport-health/api`。

### 4. 使用

- 在对话里让模型调用任意 sport-health 工具，例如“看看我最近的跑步趋势”，工具结果会渲染成图表卡片。
- 会话顶部的视图标签中选择 **运动健康**，打开独立看板。

## 配置

默认配置在 `cordis.patch.yml`，也可以在 profile 的 `cordis.patch.yml` 里覆盖同 id 条目：

```yaml
- id: mcp-sport-health
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: sport_health
    transport: streamable-http
    url: http://127.0.0.1:8080/mcp
    failOnStartupError: false
    toolCallTimeoutMs: 60000

- id: sport-health
  name: dsh-sport-health
  config:
    url: http://127.0.0.1:8080/mcp
    timeoutMs: 10000
    cacheTtlMs: 10000
```

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `url` | `http://127.0.0.1:8080/mcp` | MCP Streamable-HTTP 端点 |
| `timeoutMs` | `10000` | 看板单次 MCP 请求超时 |
| `cacheTtlMs` | `10000` | 看板工具结果缓存时间；`0` 表示不缓存 |

> 如果其他 bundle 已经注册了 `serverName: sport_health`，请删除第一层或改用不同的 `serverName`，同时修改 `src/client/lib/payload.ts` 里的 `SERVER_NAME`。

## 工具与视图

| MCP 工具 | 图表呈现 |
| --- | --- |
| `get_running_summary` | KPI 瓦片 + 记录覆盖率进度条 |
| `list_runs` | 单次距离柱状图 + `ElTable` 明细 |
| `get_daily_running` | 每日距离柱状图 + 配速折线 + 明细表 |
| `get_training_trend` | 周期跑量柱状图 + 配速折线 + 环比条形列表 |
| `get_training_mix` | 距离构成环形图 + 类型表 + 逐次分类表 |
| `get_consistency` | 训练日历热力图 + 连续区间 |
| `get_personal_bests` | 最佳成绩 KPI 瓦片 |
| `get_training_load` | ACWR 半圆仪表 + 负荷明细 + 风险建议 |
| `get_weather_impact` | 温度/湿度/风速对配速的差值条形列表 |
| `predict_race_time` | 预测成绩表 + 对比柱状图 |
| `get_run_detail` | 跑步详情 KPI + 起终天气 |
| `get_run_splits` | 分段配速柱状图 + 分段明细 |
| `get_best_efforts` | 各距离最佳成绩 KPI + 条形列表 |
| `get_run_route` | GPS 轨迹折线图（含起终点标记） |
| `get_elevation_profile` | 海拔剖面折线 + 分段爬升柱状图 |
| `get_stop_points` | 停留次数 KPI + 停留明细表 |
| `classify_run` | 类型徽章 + 配速对比条形 + 判定理由 |
| `compare_runs` | 两次跑步并排卡片 + 差异 KPI |
| `describe_data_source` | 数据源 `ElDescriptions` + 质量告警 + 文件标签 |
| `reload_data` | 同步结果 KPI |

所有卡片底部都有可折叠的 **原始数据**，方便核对。视图按工具名分派（`TOOL_VIEW_BY_TOOL`），只有工具名缺失时才回退到按载荷结构猜测——几个工具的返回字段会互相重叠（如 `get_training_mix` 也带 `runs`），按字段猜会选错分支。

## 看板接口

| 路径 | 说明 |
| --- | --- |
| `GET /sport-health/api` | 端点索引 |
| `GET /sport-health/api/health` | MCP 连通性与工具列表 |
| `GET /sport-health/api/overview` | 看板快照（summary/daily/mix/consistency/load/bests/weather/runs） |
| `GET /sport-health/api/overview?refresh=1` | 清缓存后重新拉取 |
| `GET /sport-health/api/runs?limit=20&offset=0&sortBy=date` | 分页跑步列表 |
| `GET /sport-health/api/run?id=<runId>` | 单次跑步详情包（detail/splits/route/elevation/stops/classification） |

接口只读、同源、`no-store`。看板会对每个工具单独容错：某个工具失败时其余区块仍然展示，并在“部分数据不可用”里列出错误。

## 开发

```bash
npm run build      # 构建 host + client
npm run dev        # 监听 src/ 增量构建（client + host 两个 watcher）
npm run typecheck  # vue-tsc --noEmit（含 SFC 模板类型检查）
npm test           # 20 个 toolview + pending/error 状态 + host 路由端到端
npm run preview    # 静态预览页（端口 3100）
```

### 测试

- `tests/render.mjs`：在 jsdom 里加载 `lib/client.js`，用 `tests/fixtures/` 中 20 份真实 MCP 返回逐个挂载 toolview，并检查调用中/失败/看板加载态；出现 Vue 警告即失败。
- `tests/host.mjs`：启动本地 mock MCP 服务，验证会话初始化、工具发现、工具调用、参数转发、错误码以及 session 过期后的重连重放。
- `tests/fixtures/`：真实服务返回；`api-overview.json` 是看板快照。

重新抓取 fixtures 时，保持文件名为 `sport-<tool>.json`，渲染测试会自动发现。

## 故障排查

| 现象 | 处理 |
| --- | --- |
| 卡片一直“调用中” | 确认 MCP 服务在 8080；检查 `curl http://127.0.0.1:8080/actuator/health` |
| 看板显示“离线” | 确认 host 半已加载（`/sport-health/api/health` 可访问），并检查 profile 的 bundle 列表 |
| 工具名找不到 | MCP client 未连接成功；查看 Harness 日志里的 MCP 错误，或把 `failOnStartupError` 设为 `true` 让启动直接失败 |
| `duplicate ... serverName` | 已有其他 bundle 注册 `sport_health`，改 `serverName` 并同步修改 `SERVER_NAME` |
| 桌面端看板空白 | 相对路径 `/sport-health/api` 由桌面壳转发；确认插件 host 半激活（profile 中有 `sport-health` 条目） |
| 视图标签可见但页面全白 | DevTools 里若报 `Minified React error #31`，说明 slot 组件返回了 DOM 节点而非 React 元素。跑 `npm test` 看 `slot entries are React components` 是否通过，再 `npm run build` |
| 启动报 `web boot: 1 entry did not activate` + `dsh-sport-health: failed` | 插件条目激活失败，跟「界面」无关，先看 console 里紧随其后的真实异常（多为 `no React runtime`）。原因通常是 React 没在物化阶段取到；跑 `npm test`，`react resolved through factory` 这条就是守它的 |
| 卡片有内容但完全没样式 | 检查 `<head>` 里是否有 `style[data-plugin-css="dsh-sport-health"]`。没有说明用的是旧产物，重新 `npm run build`；本项目**不会**产出可单独引用的 `lib/client.css` |

### 打开「运动健康」为什么一次打 8 个工具

看板不是「先问模型要数据」，而是 host 半对着 MCP 服务**并发拉一个聚合快照**（`src/host/api.ts` 的 `overview()`）：`get_running_summary`、`get_daily_running`、`get_training_mix`、`get_consistency`、`get_training_load`、`get_personal_bests`、`get_weather_impact`、`list_runs`。

- 这些是 **host 侧代理调用**，不进入模型上下文、不消耗 token，也不影响对话。
- 8 个调用并发执行（本机实测约 130 ms 返回全量数据），每个工具单独容错，失败只落到「部分数据不可用」。
- `cacheTtlMs`（默认 10 s）内重复打开走缓存，只有 `?refresh=1` 或点「刷新」才清缓存。
- 想进一步降噪：调大 `cacheTtlMs`，或把 `Dashboard.vue` 拆成按区块懒加载。

## 数据说明

示例数据来自 `sport-health-mcp-server` 的 `classpath:health-data`：6 次跑步、45.54 km、2026-10-25 ~ 2026-11-04。看板中的 ACWR 为 `2.3`（高风险），但由于数据只覆盖 11 天，置信度为 `LOW`，界面会同时展示这条限制说明。
