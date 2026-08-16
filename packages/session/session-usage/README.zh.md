# @deepseek-ai/dsh-session-usage

[English](README.md) | 中文

「使用统计」界面背后的双面包：Host 半区把各会话日志中 provider 上报的 token 用量聚合起来，以只读的同源 JSON 路由提供；浏览器半区渲染设置页 section 与一个侧边栏页脚入口，二者都会拉取该路由。一次查询同时给出时间区间（近 7 / 14 / 30 天，或自定义起止日期）、按模型明细（每个 provider-model 身份一行）与按任务明细（每个会话一行，含 LLM 生成的标题）。

## 聚合语义

- **数据来源。** 每条 `assistant/message` 事件在 adapter 上报计费时携带该 step 的 `TokenUsage`。折叠只统计时间戳落在闭区间 `[from, to]` 内的事件，并累加四个互不重叠的桶：未缓存输入、输出、缓存读取、缓存写入。`total` 为四者之和，与 `token-meter` 的计费口径一致。
- **缓存命中率。** 汇总卡片按区间总计派生为 `cacheRead / (input + cacheRead)`——来自缓存的 prompt token 占比——以百分比形式显示在「输出」卡片之后；区间内无输入时显示「—」。
- **防御性读取。** 缺失或畸形的用量字段按 0 折叠，与 `session-stats` 的守卫一致。
- **重复查询复用。** 每个读过的日志会归约为紧凑的逐请求样本（时间戳、provider-model 身份、四项 token 计数），存入由持久化后端逐日志修订令牌（`listSnapshots()`）门控的 Host 进程缓存：存储日志变化的会话重新读取，未变化的会话直接在缓存样本上按任意区间重折叠，标题也在同一次读取中折叠。活跃（live）会话始终重新读取，因为其内存尾部可能超出已持久化的修订。
- **按天分桶** 使用每条事件的主机本地日历日期，跨午夜的会话会拆到两个日期。
- **按模型行** 以每条被统计事件 assistant message 的 `source` 身份（`provider` 加 `model`）分桶，因此两个 provider 服务同一 model id 时保持分开；不可读的身份字段折叠为一行 `unknown/unknown`。行跨会话合并，按 `total` 降序排列。
- **按任务行** 是至少有一次被统计请求的会话，标题取最近的 `session/title` 事件（无标题时为 `null`），按 `total` 降序排列。
- **失败隔离。** 单会话日志读取互相隔离：失败的读取计入 `failedSessions`，其余报告照常返回；`scanned` 报告语料库列出的会话数。

## 组合

```yaml
- id: session-usage
  name: '@deepseek-ai/dsh-session-usage'
```

仅注册在 `dsh-web-app` bundle 中。Host 半区读取 `sessionQuery`（由 base bundle 中的 `session-query-sqlite` 提供），并在可选的 `sessionPersistence` 服务挂载时用 `listSnapshots()` 修订令牌门控样本缓存，使重复查询跳过未变化的日志；它在已挂载的 `webServer` 上注册 `/api/session-usage` 路由，没有 webServer 时不注册任何东西。`dsh.client` 清单驱动浏览器半区的设置 section 与其 `sidebar.footer.action` 条目，二者共享同一个控制器。

## Model Experience

无 —— 本包只聚合已记录的 provider 用量，不触碰任何 prompt、消息、schema、流或工具结果，且路由只读。

#### KV Cache effect

无 —— 本包从不组装或发送 provider 请求。

## 已知限制与待办

- **只统计有上报的用量** —— 未上报 `usage` 记录的 step 不可见，因此不汇报 token 计费的缓存可能显示偏低的成本。
- **Host 启动后的首次查询全量扫描一次** —— 样本缓存是进程内的，Host 启动后的第一次查询会读取每个区间内日志一次；之后的重复查询与区间切换复用样本。
- **按主机本地日期分桶** —— 日界线跟随主机时区而非浏览器时区。
- **仅注册在 web-app bundle** —— 其他组合不提供用量路由或设置 section。
