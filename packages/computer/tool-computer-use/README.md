# @deepseek-ai/dsh-tool-computer-use

English | [中文](README.zh.md)

The model-facing `computer_use` tool: drives the shared surface through `ctx.computerUse` and returns the post-action observation. This package owns the schema, per-action argument validation, prompt guidance, screenshot attachment, and presentation; the seam and its provider own the surface. The tool resolves `ctx.computerUse` at execution time, so it stays registered without a provider and fails with a structured error naming that gap.

Config: `timeoutMs` (default `60000`, covering first-call browser launch plus one navigation) and `includeScreenshot` (default `true`). Each observation is committed through `ctx.attachments` as `image/png` and returned as an image block; `includeScreenshot: false` stops committing images and leaves the URL and title text, for routes whose model cannot accept image input.

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

The model sees the generated [`computer_use` schema](../../../docs/tool-catalog.md#deepseek-aidsh-tool-computer-use): one `action` enum (`navigate`, `screenshot`, `click`, `type`) plus per-action optional fields (`url`, `x`, `y`, `text`). The timeout budget is a deployment setting, not a model argument.

#### Token effect

Fixed schema cost per request while the tool is registered. Every result carries the summary text plus, with `includeScreenshot` (the default), one PNG image block whose token cost depends on the viewport.

#### KV Cache effect

Each appended observation extends the request append-only; the earlier prefix stays reusable while the prompt sections, schema set, and prior results are unchanged. Image blocks ride the same result suffix as the summary text, so they invalidate reuse exactly where any other result content would.

## Known Limitations and Deferred Work

- **Image input required for aimed clicks** — without a vision-capable model route the text carries only URL and title, which is not enough to choose coordinates; `includeScreenshot: false` exists for that case, and a DOM or accessibility-tree text observation would be the real fix.
- **Result cards do not display the screenshot** — presentation uses the generic card; a dedicated card showing the durable image needs a client plugin.
- **No post-action settle guarantee** — the provider waits a bounded network-idle window (`settleTimeoutMs`) before screenshotting, so a transition outside that window appears stale and the model must re-observe.
