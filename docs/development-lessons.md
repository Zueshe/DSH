# DeepSeek Harness 开发心得（2026-08 上旬）

> 本文沉淀 2026-08-04 ～ 08-14 期间开发 DeepSeek Harness 本体（含发布、Web GUI、文档、测试与 CI）的个人心得与踩坑记录，供下次开工前快速重读。它是个人工作笔记，不属于文档站正式文档，不参与双语 doc-sync；每条结论的权威出处都链接到对应 Agent Note 或正式文档。

## 0. 怎么用这份文档

每次开始开发前，按顺序过一遍：先读根 `AGENTS.md`、`docs/AGENTS.md`、`docs/development.md`、`docs/testing.md`，再读本文件第 4 节的「开工前清单」，遇到具体主题再点开第 2 节的链接看 Agent Note 原文。

## 1. 这段时期的开发概况

- 发布：npm 公开发行从零到一。dsh 家族从 `0.0.1-rc.1` 一路走到公开可安装（`0.1.0-rc.1` → `rc.5`）；vendor 框架 9 个包、native landlock-run 两个平台包转为 public；另立了 Python SDK 的发布流程。这是「三个独立发布序列」和「权限按序列不按 scope」两条决策诞生的时期。
- Web GUI：onboarding 统一成一个弹窗流程并补齐英文文案、轨迹分页与加载更多、侧边栏几何与动效、会话用量统计（Usage Statistics）新页面、session 内容搜索改为 opt-in、streaming markdown 增量 AST 渲染、web 产物 vendor/index 双 chunk 拆分、通配 host 出于安全直接拒绝。
- 工程质量：Windows 原生 PR CI 双轨、仓库命名契约与角色词表、统一 GitHub label 分类法、prose 具体化标准、README 与文档双语精修、发布后 fragment 校验、Agent Notes 这一时期新增上百条。
- 时段特点：pre-release 窗口兼容性包袱轻，适合做重命名与重构；但每个决定都会进入「第一个公开版本」，一旦发布就成了事实契约，公开动作基本不可逆。

## 2. 核心心得

### 2.1 发布与版本管理（最大的坑区）

1. 版本号必须落在仓库里，CI 只负责检查和上传。本地命令 bump 并把 manifests 连同 lockfile 一起提交；人类在合并后打 tag；CI 从不写仓库、不需要写权限。这样「已发布的版本」永远可以从仓库读出来。
2. 发布拆成相互独立的序列，别一把梭。dsh 家族（`packages/*/*` + `apps/*`）、vendor 框架（9 个包）、native（landlock-run）三者版本基线、变更频率、构建要求都不同；强行一个流水线等于每次产品发布都重发框架和原生二进制。tag 命名：`dsh-v<v>` / `vendor-<pkg>-v<v>` / `landlock-run-v<v>`。
3. 两个「看不见的发布阻断器」。一是全仓库 `private: true`，npm 直接拒发；二是手写 `peerDependencies: "^0.0.1"`，`^0.0.1` 语义是 `>=0.0.1 <0.0.2`，且 semver 普通 range 不含 prerelease，所以 `0.0.1-rc.1` 也被排除——只在版本永远停在 `0.0.1` 时碰巧没炸。发布前必须修掉这类范围。
4. 发布权限按「序列」不按 scope，且永远不传 `--access`。vendor / native 是 `public`，dsh 是 `restricted`；`publishConfig.access` 由 manifest 决定，并由 workspace 约束检查保护不漂移。一个 `--access` 旗标无法服务意见不一致的序列，还会覆盖 manifest 的所有权。
5. 受限依赖会卡死公共消费者。所有 harness 包 peer 依赖 vendor 框架，`dsh-sandbox-local` 依赖 landlock 入口；公共包装不上受限依赖，所以必须先公开依赖序列，dsh 家族才能公开。
6. tag 是提交指针，不是发布证明。bump 时要向 registry 查询该版本是否已存在，否则一次失败的发布会被当成「已发布」永远跳过；未认证机器查私有包得到 E404，与版本不存在无法区分，应报告缺口而不是误判。
7. vendor 版本基线取 `max(manifest, 上次已发布版本) + patch`，并去掉上游 prerelease 段。这样上游重同步（又发 rc）不会撞号；prerelease 排练版走 `--tag next`，语义上仍低于它要跟的正式版。
8. 发布公开基本不可逆。免费计划回不到 private，已下载或镜像的内容回不来；所以公开序列的 payload 策略（哪些文件进 tarball）要更谨慎——`vendor/cordis` 因为 export map 声明 `./src/*`，tarball 必须带上 `src`。
9. `workspace:^` 还是 `workspace:*` 要想清楚。对外发布的 harness 包用 `workspace:^`（接受 patch 与 minor）；必须与二进制精确匹配的平台包用 `workspace:*`。
10. 发布与 CI 操作要幂等可重试：重试、拉开间隔、跳过已落地；这与「CI 只检查不写仓库」是同一套哲学，避免发布路径自证成功。

链接：[npm-release-sequences](../.agents/notes/implemented/process/2026-08-10-npm-release-sequences.md)、[public-vendor-and-native-sequences](../.agents/notes/implemented/process/2026-08-13-public-vendor-and-native-sequences.md)、[python-publication-workflow](../.agents/notes/implemented/process/2026-08-11-python-publication-workflow.md)。

### 2.2 命名与架构（命名即契约）

1. 名字是契约，不是标签。名字告诉贡献者责任边界在哪：`Store` 暗示数据存取，`Registry` 暗示注册与查找，`Runtime` 暗示活执行与生命周期；一个词承担三种职责时，读者必须读实现才知道谁拥有策略、工作或状态。
2. 有精确角色词就别用 `Service`。角色词表：`Controller` / `Store` / `Directory` / `Presenter` / `Registry` / `Runtime` / `Resolver` / `Binder` / `Engine` / `Policy` / `Executor` / `Gateway` / `Provider` / `Backend` / `Handle` / `Config` / `Service`。判断法：调用方主要调 `register()` 并收 disposer → `Registry`；主要调 `run()` / `dispatch()` / `cancel()` / `execute()` → `Runtime` / `Engine` / `Executor`；只做域值到 UI 的映射 → `Presenter`，一旦还改状态就不是 presenter。`Service` 只在没有更诚实的角色时用（`GoalService`、`SessionTitleService` 是合理保留）。
3. 一个家族一套词汇，不留别名。目录、npm 包名、imports、Cordis 插件名、`ctx` key、公开类型、事件或工具 id、配置、测试、fixture、示例、生成引用、文档全对齐；不保留兼容包、双事件名、重复服务 key、fallback parser。仓库直接拒绝旧名。
4. 单数 / 复数 `ctx` key 与对象角色必须一致。单个引擎、运行时、策略、控制器、存储 → 单数 key；registry 或拥有多个命名成员的服务 → 复数 key。不要给 host / client 两个不同声明复用同一个 key，TypeScript declaration merging 两边都看得见。
5. 限定词要带信息。`Bash` / `Pwsh` / `JSON-RPC` / `SQLite` / `JSONL` / `OpenTelemetry` / `Claude Code` / `E2B` 等机制名保留；不要给每个 compaction backend 都加 `LLM`（`basic` 是诚实的中性名）；不要发明「process sandbox」概念。PascalCase 内首字母缩写用 `Ui` / `Llm` / `JsonRpc` / `ApiProxy`，prose 与包名用 `UI` / `LLM` / `JSON-RPC` / `API`；`Typert` 是唯一正确拼写。
6. pre-release 窗口是唯一便宜的重命名窗口。拖进正式版，弱命名就变成兼容性契约；要改就按 rename ledger 全仓库一次推进，不要只改一部分，否则旧的偶然词汇会变成契约。
7. `SDK` 只有一个意思：JSON-RPC 客户端 / 服务端协议。项目本身是 DeepSeek Harness，不是 SDK 项目。

链接：[repository-naming-contract-and-rename-ledger](../.agents/notes/implemented/architecture/2026-08-11-repository-naming-contract-and-rename-ledger.md)、[adding-a-package](./cookbook/adding-a-package.md)。

### 2.3 文档与写作

1. 写具体，指名确切的 actor、action、source、event、field、file、process。用「哪个文件提供的配置行」而不是「配置来源」，用「哪个 provider + model 产出的消息」而不是「来源」。写作者对自己做口语检查：向同事解释同一件事时不会用的词就不要写。
2. `contract` / `boundary` / `shape` 只在语义精确时用：`contract` = 前置条件、后置条件、不变量、兼容性承诺；`boundary` = 字面的安全、信任、线缆、进程、序列化、事务、生命周期划分；`shape` = 结构形式本身是主语，且没有更窄的词（fields / schema / type / union variant / file layout / export form）。
3. 文字编辑不动代码标识符。清理命名歧义不构成改 public API、协议成员、持久化字段的理由；prose 解释它们，改名要独立走协调重命名。这也意味着「全局替换一个词」不可行，需要逐句语义分类。
4. 双语对共享同一链接目标。翻译页保留英文 heading id；不要用 locale-specific fragment，否则两个源不一致，且每个链接生产者都要知道目标语言。
5. GitHub heading id ≠ VitePress heading id。标点密集或翻译过的 heading 在 source 校验可能通过、发布后链接失效；`docs:build` 后必须跑 fragment 校验，有差异的 heading 显式加 GitHub 兼容 alias（双语对用同一个 id）。
6. 一句话一段（`verify-md-wrap`）；一个事实一个家（tier taxonomy），同一规则只在一个地方出现，其余链接过去。
7. 文档写「当前状态」，不写「变更历史」：避免 previously / now / no longer、PR 号、commit 引用；变更故事进 commit、PR、Agent Note、postmortem。
8. 生成目录（tool-catalog、config-catalog、persistence-catalog、module-graph、subsystems 的 cordis-surface 区域）从源头生成，别手改；中文对照只能通过配对流程更新。
9. 非平凡改动必须同 PR 带 Agent Note；implemented note 用现在时，讲清 why、放弃了什么、验证方式；archived note 冻结，不当当前权威。
10. 术语要一致且有中文对照表（`docs/i18n/terminology.md`）；改了一边要同步另一边。

链接：[concrete-prose-names-actors-and-recorded-facts](../.agents/notes/implemented/process/2026-08-09-concrete-prose-names-actors-and-recorded-facts.md)、[published-document-fragments](../.agents/notes/implemented/process/2026-08-13-published-document-fragments.md)、[docs/AGENTS.md](./AGENTS.md)、[.agents/notes/README](../.agents/notes/README.md)。

### 2.4 Web GUI 与前端

1. 模型可见 ⟺ 落盘。任何到达模型请求的内容必须能从 session log 重建；新的模型可见输入 = 新的 session event。这是「展示层与数据层之间哪些东西必须持久化」的判断标准。
2. 功能开关放能力提供者层级，别靠卸载插件行。必需注入（如 `ApiProxyService` 需要 `sessionQuery`）导致卸载提供者 = 整个 host 不启动；用 `openAt: never` 这类打开相位把能力「关死」在提供者内部，并给出 typed failure（`SESSION_QUERY_SEARCH_DISABLED`），让调用方区分「部署选择」和「索引故障」。不要另加一个可能互相矛盾的 boolean。
3. streaming markdown 必须增量解析，不能每帧全文重解析。`MarkdownText` 走直接 mdast 渲染：CommonMark 按行分块，追加文本只重解析 frontier 之后的部分，settled 块冻结并缓存 React 元素；DOM 由 fixture 钉死（fixture 差异是用户可见的样式变更，refactor 时不许重录）。
4. vendor chunk 拆分用精确包名 Set，零正则。边界不变量：react 家族必须留在 index——rollup 会把入口与 manual chunk 共享的模块折叠进 manual chunk，一个列出的包 import `react/jsx-runtime` 就把 react 拖进 vendor。
5. grammar chunk 判定用 moduleIds 而不是 facade：内嵌 grammar 的共享 chunk 没有 facade，用 facade 判定会漏。
6. 大目录拆分是纯配置，运行时零改动：bundler 自动发相对引用（index → `langs/`、vendor.css → `fonts/`），host 端按静态前缀原样服务即可。
7. 首帧与上手体验值得统一：onboarding 合并成一个 dialog flow、中英文文案一起覆盖，且 `test(web)` 覆盖各分支。
8. 本地 web 服务的暴露面要保守：通配 host 直接拒绝，宁可少一个便利也不多一条攻击面。
9. 列表默认与加载要按直觉并保持可度量：session 列表默认最新在前；大 jsonl 恢复用 bounded probing，冷会话元数据别一次打满；轨迹分页 / 加载更多要做对焦点与滚动归属（一行轴滚动、observed-top ledger）。
10. 用可审计方式验证产物：`node scripts/attribute-chunk-bytes.mjs <chunk.js>` 把 chunk 字节归属按 npm 包 / 目录聚合，让「vendor 不含工作区字节、react 全在 index、懒加载 grammar 数一一对应」可机器验证。

链接：[web-shell-dist-chunk-layout](../.agents/notes/implemented/architecture/2026-08-06-web-shell-dist-chunk-layout.md)、[web-markdown-incremental-ast-renderer](../.agents/notes/implemented/architecture/2026-08-06-web-markdown-incremental-ast-renderer.md)、[session-content-search-opt-in](../.agents/notes/implemented/architecture/2026-08-13-session-content-search-opt-in.md)、[onboarding-step-owned-takeover-chrome](../.agents/notes/implemented/bug-fix/2026-08-06-onboarding-step-owned-takeover-chrome.md)。

### 2.5 测试与 CI / 跨平台

1. Windows 双轨：Wine 快信号 + 原生独立 job。Wine 在 ubuntu runner 上是阻塞的快速 win32 toolchain 信号；原生 Windows job 独立运行，不进 `all-checks-passed.needs`，也不用 `continue-on-error`——自动但不阻塞、不假绿。
2. 平台坑要懂根因。Windows 8.3 短名别名（`%TEMP%` → `C:\Users\RUNNER~1`）与 libuv 长名不一致会破坏 watcher 事件断言，打开 watcher 前 `canonicalizeWatchPath()` 到最深存在祖先；junction / symlink 清理必须先 unlink 再删，直接 `rmSync` 会 EPERM；Node 24 的 CJS lexer fatal 在 Windows 共享 worker 线程复现，Vitest 用 forked workers。
3. fixture 可移植性。用 `node:path` 构造路径、比 native realpath、只断言每台主机都成立的冲突（结构化错误码、回滚、原子替换、无残留临时文件）；POSIX 专属行为（signal、mode bit、unreadability、writer lock）平台门控。snapshot fixture 必须在 macOS / Linux 都能 replay：修 fixture，不修 normalizer。
4. 覆盖率门禁是 `test:coverage`（每文件 100%）不是 `test`；Windows 原生 job 也要在 100% 分母上执行完整支持源清单，而不是缩小分母。
5. 资源预算要实测。16 核 runner 是甜点：32 核只省 1.47s 且触发 lexer fatal；并发 instrumented worker 从 6 降到 1，外加 1 个 exempt-heavy worker 并行。
6. 异步 fixture 的启动时间可能超过 Vitest 默认轮询窗口：用显式 bounded wait，别改断言结果。
7. 先跑最小集再提 PR（`dsh-pre-push-checks`），不要默认全量套件；验证要匹配表面：行为用聚焦测试、模型/用户输出用 snapshot、文档用 doc-sync、发布路径用 build + built smoke。

链接：[native-windows-pull-request-ci](../.agents/notes/implemented/process/2026-08-08-native-windows-pull-request-ci.md)、[unlink-fixture-junctions-before-delete](../.agents/notes/implemented/bug-fix/2026-08-12-unlink-fixture-junctions-before-delete.md)、[unlink-stale-profile-fallback-links](../.agents/notes/implemented/bug-fix/2026-08-12-unlink-stale-profile-fallback-links.md)、[testing.md](./testing.md)。

### 2.6 协作流程

1. PR label 分类法：恰好一个 `kind/*`（封闭集合：feature / bug-fix / doc / testing / cleanup / dependency）+ 至少一个 material `area/*`；被删除的别名要 reserve，防回潮成貌似无关的操作标签。
2. Stacked PR 用 GitHub 原生栈机制，让 GitHub 拥有栈级规则、CI、排序与 retarget；重写历史只用 `--force-with-lease`，abort on remote movement，绝不裸 `--force`。
3. 发布 / CI 操作要幂等：重试 + 间隔 + 跳过已落地；先做局部验证（真实私有发布 + 安装探针）再放行编号版本。
4. Agent Note 是活的决策记录：非平凡改动同 PR 带 note；implemented 用现在时；note 讲清为什么、放弃了什么、怎么验证。note 归档后冻结，不再当当前权威。
5. 后台任务 / 队列要有界（bounded admission），防止无限排队打爆资源；工具输出超限走 spill 文件而不是截断后丢失。

链接：[unified-github-label-taxonomy](../.agents/notes/implemented/process/2026-08-08-unified-github-label-taxonomy.md)、[native-github-stacks-and-optional-rebases](../.agents/notes/implemented/process/2026-08-02-native-github-stacks-and-optional-rebases.md)、[.agents/notes/README](../.agents/notes/README.md)。

## 3. 踩坑速查表（反模式 → 正确姿势）

| 反模式 | 正确姿势 |
|---|---|
| CI 里改版本号 | 本地 bump 提交，CI 只检查 + 上传 |
| 一个 `--access` 服务所有序列 | manifest 的 `publishConfig.access` 决定，不传 `--access` |
| 手写 `peerDependencies: ^0.0.1` | workspace: 协议 + 正确 semver 范围 |
| 卸载插件行来关闭能力 | 能力提供者里的打开相位（如 `openAt: never`）+ typed failure |
| 文档清理时顺手改 public API / 协议成员 | 改名走独立协调决策 |
| 用正则做 chunk 分类 | 精确包名 Set / moduleIds 判定 |
| `continue-on-error` 让 job「通过」 | 独立 job，不进 aggregate `needs` |
| fixture 依赖 POSIX 专属行为 | 结构化错误码 + 平台门控 |
| 只看 source 链接 | `docs:build` 后校验发布 HTML 的 fragment |
| 直接 `rmSync` 删 junction / symlink | 先 unlink 再删 |
| 假设 Windows 路径是长名 | 打开 watcher 前 canonicalize 最深存在祖先 |
| streaming 每帧全文重解析 markdown | 增量 AST 解析 + 冻结 settled 块 |

## 4. 开工前清单

1. 环境：读根 `AGENTS.md`、`docs/AGENTS.md`、`docs/development.md`、`docs/testing.md`。
2. 定位：这次改动属于哪个 tier、哪个包、哪个发布序列；是否动 `package.json`（涉及 release 序列）或生成目录。
3. 命名：查角色词表和命名 ledger；一个家族一套词，单复数 `ctx` key 与角色一致。
4. 改包 / 接口：同步更新 subsystems 页、catalog 生成源、包 README、双语对、同 PR 的 Agent Note。
5. 测试：平台可移植 fixture、覆盖率门禁、keyless snapshot（真实可运行示例，fixture 必须 macOS / Linux 都能 replay）。
6. 发布前：确认序列归属、access 级别、peerDeps 范围、版本落地提交、向 registry 查询确认未发布过。
7. 文档：一句话一段、具体命名、双语同步、发布后 fragment 校验。
8. 提 PR：恰好一个 `kind/*` + 至少一个 `area/*`、非平凡带 Agent Note、stacked 用原生栈、push 前跑 `dsh-pre-push-checks`。
