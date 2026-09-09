# @deepseek-ai/dsh-tool-computer-use

[English](README.md) | 中文

面向模型的 `computer_use` 工具：通过 `ctx.computerUse` 驱动共享界面并返回操作后的观察结果。本包拥有 schema、按操作的参数校验、提示词指引、截图附件与展示；界面本身由能力缝及其 provider 拥有。工具在执行时解析 `ctx.computerUse`，因此在没有 provider 时仍保持注册，并以结构化错误指明该缺口。

配置：`timeoutMs`（默认 `60000`，覆盖首次调用时的浏览器启动加一次导航）与 `includeScreenshot`（默认 `true`）。每个观察结果经 `ctx.attachments` 以 `image/png` 提交，并作为 image 块返回；`includeScreenshot: false` 停止提交图片，仅保留 URL 与标题文本，适用于路由的模型无法接受图片输入的场景。

## Model Experience

### System prompt

#### What the model sees

The tool contributes one guidance section, registered whenever the plugin loads.

##### Computer-use guidance

```markdown
Use the computer_use tool to drive the controllable browser surface: navigate to a URL, take a screenshot to observe the current state, click viewport coordinates, and type text into the focused element. Every action returns the post-action screenshot, page URL, and title. Read the screenshot to locate elements before clicking, and take a new screenshot after actions whose effect may still be settling.
```

#### Token effect

Fixed guidance cost per request once the plugin is loaded, independent of `includeScreenshot` and of provider presence.

#### KV Cache effect

Prefix-stable while the plugin stays loaded; mounting or disposing it invalidates reuse from this prompt section onward. Tool results are request suffixes and do not affect the prefix.

### Tool schema

#### What the model sees

The model sees the generated [`computer_use` schema](../../../docs/tool-catalog.zh.md#deepseek-aidsh-tool-computer-use): one `action` enum (`navigate`, `screenshot`, `click`, `type`) plus per-action optional fields (`url`, `x`, `y`, `text`). The timeout budget is a deployment setting, not a model argument.

#### Token effect

Fixed schema cost per request while the tool is registered. Every result carries the summary text plus, with `includeScreenshot` (the default), one PNG image block whose token cost depends on the viewport.

#### KV Cache effect

Each appended observation extends the request append-only; the earlier prefix stays reusable while the prompt sections, schema set, and prior results are unchanged. Image blocks ride the same result suffix as the summary text, so they invalidate reuse exactly where any other result content would.

## Known Limitations and Deferred Work

- **Image input required for aimed clicks** — without a vision-capable model route the text carries only URL and title, which is not enough to choose coordinates; `includeScreenshot: false` exists for that case, and a DOM or accessibility-tree text observation would be the real fix.
- **Result cards do not display the screenshot** — presentation uses the generic card; a dedicated card showing the durable image needs a client plugin.
- **No post-action settle guarantee** — the provider waits a bounded network-idle window (`settleTimeoutMs`) before screenshotting, so a transition outside that window appears stale and the model must re-observe.
