# Computer Capability

English | [中文](README.zh.md)

The computer-use capability family: a Service Definition for one shared controllable surface, a Playwright Chromium provider, and the model-facing `computer_use` tool.

| Package | ctx key | Role |
|---|---|---|
| [`computer-use/`](computer-use/) | — | Service Definition: observation, navigation, pointer, and typing vocabulary (`ctx.computerUse`) plus the `ComputerUseError` taxonomy |
| [`computer-use-playwright/`](computer-use-playwright/) | `computerUse` | Service Provider: one lazy-launched shared Playwright Chromium page |
| [`tool-computer-use/`](tool-computer-use/) | — | Consumer: the `computer_use` tool with screenshot attachment and presentation |

Rules: [package](../AGENTS.md), [root](../../AGENTS.md#conventions).
