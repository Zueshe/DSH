# @deepseek-ai/dsh-computer-use-playwright

[English](README.md) | 中文

计算机使用缝的 Playwright provider：一个共享的 Chromium 页面，以 `ctx.computerUse` 提供。浏览器在首次操作时惰性启动，并在插件 fiber 销毁时关闭；启动失败会清除缓存的 promise，使下一次操作重试。截图是 PNG 视口捕获；`navigate` 等待 `load` 并尊重调用方的取消信号。

配置：`headless`（默认 `true`）、`viewportWidth`/`viewportHeight`（默认 `1280`×`800`，下限 `200`）、`navigationTimeoutMs`（默认 `30000`，下限 `1000`）、`settleTimeoutMs`（默认 `1500`，`0` 表示禁用）——即 `click`/`type` 之后、观察截图之前的有界 network-idle 等待，使操作触发的导航通常能在同一次观察中可见。Playwright 在首次启动时动态导入；缺少该包或缺少 Chromium 二进制会以 `COMPUTER_USE_LAUNCH_FAILED` 大声失败，消息中带有 `npx playwright install chromium` 修复指引。

## Model Experience

Indirectly, through dsh-tool-computer-use, which renders the observations this provider returns.

#### KV Cache effect

The provider adds no request content of its own and does not invalidate any reusable prefix.

## Known Limitations and Deferred Work

- **Settle is network-idle only** — a slow transition that keeps no network open (pure CSS animation, JS-only state change) can still miss the bounded `settleTimeoutMs` window; the model re-observes when the screenshot shows a stale state.
- **No URL policy** — the provider navigates wherever the model asks, including private-network targets; compositions that must not reach internal surfaces need a policy owner before enabling the tool.
