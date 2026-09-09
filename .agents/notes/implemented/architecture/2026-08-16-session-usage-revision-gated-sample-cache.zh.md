# Agent Note: Usage Statistics reuses unchanged logs through revision-gated samples

Status: implemented

[English](2026-08-16-session-usage-revision-gated-sample-cache.md) | 中文

## Problem

「使用统计」的每次查询——每次打开面板、切换区间、点击刷新——都要重新读取并折叠整个语料库：`collectUsageReport` 先列出会话，以有界并发逐个读取完整日志，随后 `readTitleSnapshots` 又把每个冷会话的日志再加载一遍来折叠标题。每次打开等于两次全量语料扫描，成本随语料规模线性增长，在真实部署上已经明显变慢（[设置功能 note](../feature/2026-08-14-session-usage-settings.zh.md) 当时正是把增量设计推迟到了这个需求出现为止）。

## Decision

Host 路由为其 fiber 生命周期持有一个进程内的 `UsageSessionCache`，连同可选的 `sessionPersistence` 服务一起传给 `collectUsageReport`：

- 每个读过的日志归约为紧凑的逐请求样本——时间戳、provider-model 身份、四项 token 计数——并在读取时由 `SessionPersistence.listSnapshots()` 报告的持久化修订令牌门控缓存。快照列举只是元数据遍历（JSONL 后端为目录扫描加 `stat`；修订包含 dev/ino/size/mtimeNs/ctimeNs），因此每次查询廉价地重列修订，只有精确匹配才返回缓存行。
- 区间折叠作用在样本而非事件上。样本携带毫秒时间戳，因此缓存会话在任意 `[from, to]` 上的重折叠都是精确的——包括 `to` 为 `Date.now()`（当天中间时刻）的预设区间，这是按天分桶无法复现的。`aggregate.ts` 因此拆分为 `extractUsageSamples`（防御性读取不变）与 `foldSessionSamples`；单事件折叠已删除，两个阶段不会漂移。
- 标题从产生样本的同一次读取中折叠（`foldSessionTitle`）并与样本一起缓存；`readTitleSnapshots` 不再参与用量路径，一次查询不会把任何日志读两遍。
- 活跃（live）会话永不进缓存：其内存尾部可能超出已持久化的修订，因此每次查询都重新读取（内存快照，无磁盘 I/O）。
- 缺少 `sessionPersistence`、缺少缓存、或快照列举失败时，每个会话按查询读取——即原先的行为，fail-soft。

## Alternatives considered

**在 `ctx.sessionProjections` 上注册带持久化检查点的 `sessionUsage` 投影单元**（`sessionStats` 模式）：为该需求拒绝——精确到毫秒的区间让单元状态成为无限增长的逐请求列表而非有界计数器，且面板要读取整个语料库的冷会话，收益仍依赖投影缓存的恢复阶梯。修订门控的进程内缓存以不引入新持久化格式的方式达成同样的重复打开收益；若 Host 重启后的首次打开成本日后成为问题，持久化检查点仍是后续路径。

**按区间对整份报告做 TTL 记忆化**：拒绝——计时器用新鲜度换速度，没有正确性故事。修订在存储日志变化时精确失效，活跃会话反正每次重读，TTL 能买到的只有过期。

**把 `to` 截断到当天结束，使按天分桶可重折叠**：拒绝——为迁就缓存表示而改造区间契约，自定义区间的边界也不再精确。样本很小（每个被统计请求一行），折叠保持诚实。

## Consequences

- 重复打开、切换区间与点击刷新的成本变为一次语料列举、一次快照列举加内存样本折叠；未变化的日志不再被读取。
- Host 启动后的首次查询仍会读取每个区间内日志一次（缓存是进程内的）；已作为包 README 的已知限制记录。
- 活跃会话每次查询支付一次新的内存快照读取——正确性优先于跳过，受同时活跃会话数约束。
- 并发查询可能重复一次冷读取（双方都在对方写入前未命中）；无害，下一次查询即命中缓存行。
- 报告的 wire 内容不变；变化的只有成本曲线。

## Testing

- 聚合：提取对每个携带 usage 的事件保留一个全零样本并丢弃其余事件；同一份提取样本在变化的区间上精确重折叠。
- 查询驱动：重复查询零重读且返回相等报告；修订变化只重读该会话；区间切换不读取即重折叠样本；活跃会话在修订不变时仍重读；缺少缓存、会话无快照修订、快照列举失败都退化为按查询读取。
- 缓存单元：缓存行仅在精确匹配的修订下命中，store 覆盖旧值，prune 丢弃未列出的会话，dispose 清空。
