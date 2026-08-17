# Agent Note: Computer Use — browser-scoped capability seam with screenshot observations

Status: implemented

English | [中文](2026-08-16-computer-use-browser-seam.zh.md)

## Problem

The harness had no computer-use capability: a model could not observe or drive a GUI, so tasks that need a browser (checking a deployed page, reproducing a UI report, walking a web flow) fell back on curl-shaped tools. The request was a minimal browser-scoped prototype in the shape codex-style computer use popularized: observe a screenshot, then act by coordinates.

Two constraints shaped the design. First, `ToolResultBlock.content` is `ContentBlock[]` and the pi-ai adapter converts nested image blocks in tool results into multimodal request content, while the DeepSeek chat-completions adapter rejects image content outright — so screenshots reach the model only on a vision-capable route through `llm-pi-ai`. Second, the "model-visible ⟺ logged" rule requires the durable session log to reconstruct whatever the model saw; `ImageAttachmentRef` already carries that for composer images, so reusing the attachment service gives screenshots the same durable, content-addressed home.

## Decision

Add the `packages/computer/` group as a standard three-role capability seam:

1. **Service Definition `dsh-computer-use`** (`ctx.computerUse`). Four operations — `navigate`, `observe`, `click`, `type` — each returning one `ComputerObservation` (PNG raster, surface address, surface title), so the model loop is observe → act → observe with no separate read call. No registry and no selection: one provider per composition; a closed `ComputerUseError` code set (`COMPUTER_USE_LAUNCH_FAILED`, `COMPUTER_USE_ACTION_FAILED`) covers provider failure.
2. **Provider `dsh-computer-use-playwright`.** One shared Chromium page, launched lazily by dynamic `playwright` import on the first action, closed with the fiber; a failed launch clears the cached promise so the next action retries. Config: `headless`, viewport size, navigation timeout, and the bounded network-idle settle wait after `click`/`type`. Missing package or browser binary fails loud as `COMPUTER_USE_LAUNCH_FAILED` with the `npx playwright install chromium` fix.
3. **Consumer `dsh-tool-computer-use`.** One `computer_use` tool with an `action` enum plus per-action fields, hand-validated into a discriminated form (`navigate` wants an absolute http(s) URL, `click` non-negative integer coordinates, `type` non-empty text). Each observation is committed through `ctx.attachments` as `image/png` and rendered as a text block plus an image block; `includeScreenshot: false` (config) stops committing images for text-only routes. The tool resolves the service with `ctx.get` at execution time, so it stays registered without a provider and fails naming that gap — the tool-web enablement contract.

**Mounting.** The provider rides the host plane of the `base` bundle beside `web` (services are process-global; presets cannot own them); the tool mounts in the `standard` agent preset only, so profiles that never name it stay browserless and other presets opt in by adding one row. Chromium launching lazily keeps the loaded-but-unused row free.

**Coverage.** The provider's browser suite drives real Chromium over data-URL pages (self-skipping without the binary); the exhaustive-coverage CI lane installs Chromium because that suite is the only coverage source for the Playwright adapter. The tool's unit suite runs through `ctx.tools.execute()` against a fake surface and the real attachment store, and a REAL-composition test boots a test-only `cordis.yml` through the Loader asserting the model-visible registrations.

## Alternatives considered

**Driving the OS desktop instead of a browser** (a desktop-GUI provider over screen capture and input synthesis): deferred — real computer use in the codex sense, but it adds an OS-level automation dependency, per-platform input injection, and a security review that a browser-scoped prototype does not need; the seam's observation/action vocabulary already models it, so a desktop provider can land later without consumer changes.

**A DOM-serialized observation (HTML or accessibility tree) instead of screenshots**: rejected as the primary observation — a text tree fits text-only model routes and is cheaper in tokens, but coordinate aiming from a tree requires the model to map layout itself, and the browser's own raster is the ground truth; it remains the follow-up for vision-less routes.

**A `computerUse` provider registry with selection like `ctx.web`**: rejected — the seam has exactly one provider and one shared surface; a registry would add selection semantics with no second implementation to select between. Direct provision keeps the service resolvable or absent, and the tool names that gap at execution time.

## Consequences

- Screenshot tokens ride the tool-result suffix of each request: append-only growth, no prefix invalidation beyond what any tool result causes. Text-only model routes cannot carry the image block; the DeepSeek adapter would reject such a request, which is a deployment fact the tool README and preset comment both state.
- One shared page serializes all agents on a composition; coordinate aiming assumes the viewport configured on the provider (default 1280×800).
- The provider applies no URL policy: the model can navigate to private-network targets (including the local GUI itself). Compositions that must not reach internal surfaces need a policy owner before enabling the tool.
- Result presentation is the generic card; a client card that displays the durable screenshot is future work, as is a DOM/accessibility-tree text observation for vision-less routes.
