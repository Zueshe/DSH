# 计算机使用（Computer Use）

[English](computer-use.md) | 中文

计算机使用（computer-use）能力缝——一个横跨**四个操作**（navigate 导航、observe 观察、click 点击、type 输入）的 [capability seam](../../.agents/notes/implemented/architecture/2026-06-13-capability-seams.zh.md)，落在单个 `ctx.computerUse` 服务上，并拆分为多个包：Service Definition（[dsh-computer-use](../../packages/computer/computer-use)，`ctx.computerUse` 与错误码分类）、Service Provider（[dsh-computer-use-playwright](../../packages/computer/computer-use-playwright)，一个惰性启动、全局共享的 Playwright Chromium 页面）与 Consumer（[dsh-tool-computer-use](../../packages/computer/tool-computer-use)，`computer_use` 工具 schema）。计算机使用是**一个可选能力**，不属于 agent-loop 主干——因此其类型定义放在本页而不是 [core.zh.md](core.zh.md)。更换 provider 不改变模型驱动这个界面的方式。

来源：[`packages/computer/computer-use/src/types.ts`](../../packages/computer/computer-use/src/types.ts)

## 为什么一个能力有四个操作

四个操作共享同一个界面与同一套观察结果，但没有共享的请求 schema：导航接收 URL，点击接收视口坐标，输入接收按键序列，观察什么都不接收。它们被刻意设计为同一个 `ctx.computerUse` 中间层，因为界面是一个共享的可变资源——按契约操作必须串行——且每个操作都返回完整的操作后观察结果，使模型循环为 观察 → 操作 → 观察，无需单独的读取调用。Provider 拥有界面本身；面向模型的名称、schema、提示词指引、截图附件与展示全部落在单一的 `dsh-tool-computer-use` Consumer 中。

## 观察结果

每个操作都解析为同一个观察三元组：操作后视口的 PNG 栅格、当前界面地址、当前界面标题。

```ts type-equiv
/** The complete state one action or observation returns. */
interface ComputerObservation {
  /** PNG-encoded screenshot of the post-action viewport. */
  screenshot: Uint8Array
  /** Current surface address: the browser URL, or the provider's equivalent locator. */
  url: string
  /** Current surface title: the page title, or the provider's equivalent label. */
  title: string
}

```

```ts type-equiv
/** One viewport/window location in provider pixels, origin top-left. */
interface ComputerPoint {
  /** Horizontal offset from the left edge. */
  x: number
  /** Vertical offset from the top edge. */
  y: number
}
```

Consumer 通过持久附件服务提交 `screenshot`，并把引用作为 image 块返回，因此字节保存在会话日志之外，而模型可见内容仍可从日志重建（[attachment.zh.md](attachment.zh.md)）。纯文本模型路由无法携带 image 块；此时 Consumer 的 `includeScreenshot` 配置可停止提交图片，仅保留 URL 与标题文本。

## 错误码分类

`ComputerUseError` 携带一个封闭的错误码：`COMPUTER_USE_LAUNCH_FAILED`（provider 无法启动其界面，包括浏览器二进制缺失，消息中带有安装修复指引）或 `COMPUTER_USE_ACTION_FAILED`（provider 已启动但某个操作失败）。Consumer 将缝错误原样作为工具错误上抛；provider 缺失是 Consumer 侧的失败，指明未挂载任何 provider。

<!-- BEGIN GENERATED cordis-surface (gen-cordis-catalog.ts) — do not edit between markers -->

<a id="cordis-surface"></a>

## Cordis API

Generated from source by `scripts/gen-cordis-catalog.ts` (verified fresh by `pnpm run verify-cordis-catalog` in doc-sync; regenerate with `pnpm run gen-cordis-catalog`) — this section is byte-identical in both language sides of the page. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../cordis-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [cordis-api/inherited.md](../cordis-api/inherited.md).

<a id="ctxcomputeruse--computeruseservice-abstract-seam"></a>

### `ctx.computerUse` — `ComputerUseService` (abstract seam)

The computer-use service. Registered as `ctx.computerUse` (one instance per context). Implementations own one shared surface; actions are sequential by contract because they mutate that shared state.

```ts cordis-catalog
/**
 * Drive the surface to an absolute address.
 * @param url - absolute URL the provider understands.
 * @param signal - optional cancellation for the navigation and observation work.
 * @returns the post-navigation observation.
 */
abstract navigate(url: string, signal?: AbortSignal): Promise<ComputerObservation>

/**
 * Observe the current surface without acting.
 * @param signal - optional cancellation for the observation work.
 * @returns the current observation.
 */
abstract observe(signal?: AbortSignal): Promise<ComputerObservation>

/**
 * Click one point on the surface.
 * @param point - viewport/window location in provider pixels.
 * @param signal - optional cancellation for the click and observation work.
 * @returns the post-click observation.
 */
abstract click(point: ComputerPoint, signal?: AbortSignal): Promise<ComputerObservation>

/**
 * Type text into the surface's current focus.
 * @param text - keystrokes to send to the focused element.
 * @param signal - optional cancellation for the typing and observation work.
 * @returns the post-typing observation.
 */
abstract type(text: string, signal?: AbortSignal): Promise<ComputerObservation>
```

Source: [`packages/computer/computer-use/src/index.ts:44`](../../packages/computer/computer-use/src/index.ts)
<!-- END GENERATED cordis-surface -->
