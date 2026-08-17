# Agent Note：Computer Use——带截图观察的浏览器域能力缝

Status: implemented

[English](2026-08-16-computer-use-browser-seam.md) | 中文

## Problem

本 harness 此前没有计算机使用能力：模型无法观察或驱动 GUI，因此需要浏览器的任务（检查部署后的页面、复现 UI 问题、走一遍 Web 流程）只能退回 curl 形态的工具。需求是一个最小化的浏览器域原型，形态即 codex 式 computer use：观察一张截图，然后按坐标操作。

两个约束决定了设计。第一，`ToolResultBlock.content` 是 `ContentBlock[]`，且 pi-ai 适配器会把工具结果里嵌套的 image 块转换为多模态请求内容，而 DeepSeek chat-completions 适配器直接拒绝图片内容——因此截图只有在 `llm-pi-ai` 的视觉路由上才能到达模型。第二，"model-visible ⟺ logged" 规则要求持久会话日志能重建模型看到的一切；`ImageAttachmentRef` 已为 composer 图片承担这一职责，因此复用附件服务让截图获得同样持久、内容寻址的归宿。

## Decision

新增 `packages/computer/` 组，按标准三角色能力缝落地：

1. **Service Definition `dsh-computer-use`**（`ctx.computerUse`）。四个操作——`navigate`、`observe`、`click`、`type`——每个都返回一个 `ComputerObservation`（PNG 栅格、界面地址、界面标题），使模型循环为 观察 → 操作 → 观察，无需单独的读取调用。没有注册表也没有选择逻辑：每个组合一个 provider；封闭的 `ComputerUseError` 错误码（`COMPUTER_USE_LAUNCH_FAILED`、`COMPUTER_USE_ACTION_FAILED`）覆盖 provider 失败。
2. **Provider `dsh-computer-use-playwright`。** 一个共享 Chromium 页面，首次操作时经动态 `playwright` 导入惰性启动，随 fiber 关闭；启动失败会清除缓存 promise，使下一次操作重试。配置：`headless`、视口尺寸、导航超时，以及 `click`/`type` 之后有界的 network-idle 等待。缺少该包或缺浏览器二进制时以 `COMPUTER_USE_LAUNCH_FAILED` 大声失败，消息带 `npx playwright install chromium` 修复指引。
3. **Consumer `dsh-tool-computer-use`。** 单个 `computer_use` 工具，带 `action` 枚举与按操作字段，并手工校验为判别形式（`navigate` 要求绝对 http(s) URL，`click` 要求非负整数坐标，`type` 要求非空文本）。每个观察结果经 `ctx.attachments` 以 `image/png` 提交，渲染为文本块加 image 块；`includeScreenshot: false`（配置）为纯文本路由停止提交图片。工具在执行时以 `ctx.get` 解析服务，因此在无 provider 时仍保持注册，并点名该缺口失败——即 tool-web 的启用契约。

**挂载。** provider 位于 `base` bundle 的 host 层、紧邻 `web`（服务是进程级的，预设无法拥有它们）；工具只挂载进 `standard` agent 预设，因此从不点名它的 profile 保持无浏览器，其他预设通过加一行选择启用。Chromium 惰性启动，使已加载但未使用的行零成本。

**覆盖。** provider 的浏览器套件用真实 Chromium 驱动 data-URL 页面（缺二进制时自跳过）；exhaustive-coverage CI 通道安装 Chromium，因为该套件是 Playwright 适配器唯一的覆盖来源。工具的单测套件经 `ctx.tools.execute()` 对假界面与真实附件存储运行；一个 REAL-composition 测试通过 Loader 启动测试专用 `cordis.yml`，断言模型可见的注册项。

## Alternatives considered

**驱动操作系统桌面而非浏览器**（基于屏幕捕获与输入合成的桌面 GUI provider）：推迟——这是 codex 意义上的真正 computer use，但引入 OS 级自动化依赖、按平台的输入注入与安全评审，都是浏览器域原型不需要的；能力缝的观察/操作词汇已经覆盖它，桌面 provider 可在后续不改 Consumer 的情况下落地。

**以 DOM 序列化观察（HTML 或无障碍树）替代截图**：作为主观察形式被否——文本树适合纯文本模型路由且 token 更省，但从树到坐标的瞄准需要模型自行完成布局映射，而浏览器自身的栅格才是唯一事实源；它仍是面向无视觉路由的后续工作。

**像 `ctx.web` 那样的 `computerUse` provider 注册表加选择逻辑**：被否——该缝恰好只有一个 provider 和一个共享界面；注册表会为没有第二个实现可选的场景引入选择语义。直接提供让服务要么可解析要么缺失，工具在执行时点名该缺口。

## Consequences

- 截图 token 挂在每个请求的工具结果后缀上：只做追加式增长，除任何工具结果都会造成的影响外不使前缀失效。纯文本模型路由无法携带 image 块；DeepSeek 适配器会拒绝此类请求，这是工具 README 与预设注释都写明的部署事实。
- 单个共享页面使同一组合上的所有 agent 串行；坐标瞄准假定 provider 配置的视口（默认 1280×800）。
- provider 不施加 URL 策略：模型可以导航到私网目标（包括本 GUI 自身）。不允许触达内网的组合需要先有策略所有者再启用该工具。
- 结果展示使用通用卡片；展示持久截图的客户端卡片是后续工作，面向无视觉路由的 DOM/无障碍树文本观察同理。
