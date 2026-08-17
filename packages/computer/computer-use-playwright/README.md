# @deepseek-ai/dsh-computer-use-playwright

English | [中文](README.zh.md)

The Playwright provider for the computer-use seam: one shared Chromium page provided as `ctx.computerUse`. The browser launches lazily on the first action and closes when the plugin fiber disposes; a failed launch clears its cached promise so the next action retries. Screenshots are PNG viewport captures; `navigate` waits for `load` and honors the caller's cancellation signal.

Config: `headless` (default `true`), `viewportWidth`/`viewportHeight` (default `1280`×`800`, floor `200`), `navigationTimeoutMs` (default `30000`, floor `1000`), and `settleTimeoutMs` (default `1500`, `0` disables) — the bounded network-idle wait after `click`/`type` before the observation screenshots, so a navigation the action started is usually visible in the same observation. Playwright is imported dynamically at first launch; a missing package or missing Chromium binary fails loud as `COMPUTER_USE_LAUNCH_FAILED` with the `npx playwright install chromium` fix in the message.

## Model Experience

Indirectly, through dsh-tool-computer-use, which renders the observations this provider returns.

#### KV Cache effect

The provider adds no request content of its own and does not invalidate any reusable prefix.

## Known Limitations and Deferred Work

- **Settle is network-idle only** — a slow transition that keeps no network open (pure CSS animation, JS-only state change) can still miss the bounded `settleTimeoutMs` window; the model re-observes when the screenshot shows a stale state.
- **No URL policy** — the provider navigates wherever the model asks, including private-network targets; compositions that must not reach internal surfaces need a policy owner before enabling the tool.
