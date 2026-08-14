# @deepseek-ai/dsh-session-usage

[English](README.md) | 中文

「使用统计」设置页背后的双面包：Host 半区把各会话日志中 provider 上报的 token 用量聚合起来，以只读的同源 JSON 路由提供；浏览器半区渲染设置页 section 并拉取该路由。一次查询同时给出时间区间（近 7 / 14 / 30 天，或自定义起止日期）与按任务明细（每个会话一行，含 LLM 生成的标题）。

## 聚合语义

- **数据来源。** 每条 `assistant/message` 事件在 adapter 上报计费时携带该 step 的 `TokenUsage`。折叠只统计时间戳落在闭区间 `[from, to]` 内的事件，并累加四个互不重叠的桶：未缓存输入、输出、缓存读取、缓存写入。`total` 为四者之和，与 `token-meter` 的计费口径一致。
- **防御性读取。** 缺失或畸形的用量字段按 0 折叠，与 `session-stats` 的守卫一致。
- **按天分桶** 使用每条事件的主机本地日历日期，跨午夜的会话会拆到两个日期。
- **按任务行** 是至少有一次被统计请求的会话，标题取最近的 `session/title` 事件（无标题时为 `null`），按 `total` 降序排列。
- **失败隔离。** 单会话日志读取与标题折叠互相隔离：失败的读取计入 `failedSessions`，其余报告照常返回；`scanned` 报告语料库列出的会话数。

## 组合

```yaml
- id: session-usage
  name: '@deepseek-ai/dsh-session-usage'
```

仅注册在 `dsh-web-app` bundle 中。Host 半区读取 `sessionQuery`（由 base bundle 中的 `session-query-sqlite` 提供），并在已挂载的 `webServer` 上注册 `/api/session-usage` 路由；没有 webServer 时不注册任何东西。`dsh.client` 清单驱动浏览器半区的设置 section。

## Model Experience

无 —— 本包只聚合已记录的 provider 用量，不触碰任何 prompt、消息、schema、流或工具结果，且路由只读。

#### KV Cache effect

无 —— 本包从不组装或发送 provider 请求。

## 已知限制与待办

- **只统计有上报的用量** —— 未上报 `usage` 记录的 step 不可见，因此不汇报 token 计费的缓存可能显示偏低的成本。
- **按主机本地日期分桶** —— 日界线跟随主机时区而非浏览器时区。
- **暂无按模型/provider 拆分** —— 报告跨模型聚合；按路由拆分是该折叠的自然扩展。
- **仅注册在 web-app bundle** —— 其他组合不提供用量路由或设置 section。
