# Agent Note: 使用统计 —— 基于会话语料库的 token 用量设置页

Status: implemented

[English](2026-08-14-session-usage-settings.md) | 中文

## 问题

每条 `assistant/message` 事件都记录着 provider 上报的 token 用量，但没有任何界面把它展示出来：没有地方能看到某个时间窗口内花掉了多少 token、哪些会话（任务）消耗了多少。需求是像 Zcode 使用统计那样的设置页功能 —— 近 7 / 14 / 30 天或自定义区间的总用量，外加按任务明细。

第一次尝试用动态 Cordis 插件交付（注册 `settings.section` + `harness.handle` RPC）。Host 侧聚合正常并通过持久化日志验证，但动态插件的浏览器半区在运行中的部署里不可靠：设置 section 里的 `host.call` 永不返回、客户端定时器不触发、全新页面完全不加载动态客户端半区、运行卡片按钮不渲染。症状指向动态客户端运行时本身而非聚合逻辑，因此永久功能必须改用经过验证的产品客户端栈，而不是动态路径。

## 决策

交付一个仅注册在 `dsh-web-app` bundle 中的双面包 `packages/session/session-usage`（`@deepseek-ai/dsh-session-usage`）：

1. **Host 半区。** 通过既有 `sessionQuery` 服务读取持久化语料库（`listSessions` → 逐会话 `readSession` → `readTitleSnapshots`），在闭区间内折叠 `assistant/message` 事件里的 provider 用量，并在已挂载的 `webServer`（`ctx.get('webServer')`，可选 —— 无 webServer 时本包不做任何事）上注册只读同源 JSON 路由 `/api/session-usage`。单会话读取失败被隔离并计入 `failedSessions`；标题折叠尽力而为。
2. **浏览器半区。** 注册 `settings.section` 条目（`id: 'usage-stats'`），组件通过一个小控制器拉取路由，渲染时间区间（近 7 / 14 / 30 天或自定义日期对）、汇总卡片（总/输入/输出/缓存读取/缓存写入 tokens、请求数、会话数）、按天柱状列表、以及带搜索过滤的按任务表格。文案经 locale 服务注册（中/英）。

聚合拆成纯折叠（`aggregate.ts`，直接单测）与语料驱动（`query.ts`，用假的 `SessionQueryEngine` 测试）；路由与其区间解析位于 `index.ts`。

**Token 语义。** `total` 为输入 + 输出 + 缓存读取 + 缓存写入的互不重叠之和，与 `token-meter` 计费口径一致。只统计携带 provider 上报 `usage` 的事件；畸形字段按 0 折叠，与 `session-stats` 守卫一致。按天分桶使用每条被统计事件的主机本地日历日期。

## 后果

- 设置页只出现在 web-app 组合中；其他界面没有用量路由或 section。
- 每次浏览用量都是 O(语料库) —— 每次请求都会读取并折叠全部会话日志，带有限并行度（`SESSION_USAGE_READ_CONCURRENCY = 6`）。当前语料库约 5 秒返回；大规模部署日后可能需要增量投影。
- 路由刻意放在 `/api` RPC 信封之外 —— 与 `/api/session.export` 一样是物理无信封 GET，因此新增它没有触碰 `IApiClient`/api-proxy 契约。

## 测试

- 纯折叠测试：桶求和、区间过滤、防御性畸形用量、空日志、报告装配排序、日期键。
- 针对假引擎的语料驱动测试：空语料、标题附加、晚于区间末创建的会话被跳过且不读取、失败读取计数、标题失败被包含。
- 路由解析测试与客户端控制器测试（URL 形态、2xx 解析、非 2xx 报错）。
- 组件测试（jsdom）：卡片/按天/按任务渲染、错误呈现、空状态、搜索收窄、`resolveRange` 计算。

## 备选方案

**继续修复动态插件的浏览器半区。** 永久功能不予采纳：症状（`host.call` 永不返回、客户端定时器不触发、全新页面不加载客户端半区）指向动态客户端运行时而非页面代码，永久功能不能走脆弱路径。

**通过 `dsh-host-apiproxy` 新增 `IApiClient` 方法暴露查询。** 否决：给统一 API 加 Remote 方法要动客户端契约、`WebApiClient` 与整个连接栈的 fixture 面 —— 比单个只读消费者的一条物理路由大得多。

**做成带 `@Remote` 方法的 `sessionUsage` Cordis Service（类）。** 暂缓：当前唯一消费者是设置页，因此聚合放在导出的纯函数加路由处理器里；日后可以在不改契约的前提下用服务类包裹同一套折叠。

**用 `settings.general.item` 行而不是完整 section。** 否决：这是一个整页功能而非单个偏好项；`settings.section` 是完整设置 UI 的既定位置。

## 风险

**每次查询线性扫描语料库。** 大型语料库下这是主要成本；有界池保持单会话有界，报告保持正确。投影缓存是自然的后续步骤，但在出现真实需求前刻意不做。

**按主机本地日期分桶。** 日界线跟随主机时区，GUI 与主机时区不一致时按主机日历分桶；已记录为已知限制。
