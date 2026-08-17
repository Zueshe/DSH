# 计算机使用能力（Computer Capability）

[English](README.md) | 中文

计算机使用能力家族：一个面向共享可控界面的 Service Definition、一个 Playwright Chromium provider，以及面向模型的 `computer_use` 工具。

| Package | ctx key | 角色 |
|---|---|---|
| [`computer-use/`](computer-use/) | — | Service Definition：观察、导航、指针与输入的类型定义（`ctx.computerUse`）以及 `ComputerUseError` 错误码分类 |
| [`computer-use-playwright/`](computer-use-playwright/) | `computerUse` | Service Provider：一个惰性启动、全局共享的 Playwright Chromium 页面 |
| [`tool-computer-use/`](tool-computer-use/) | — | Consumer：带截图附件与展示的 `computer_use` 工具 |

规则：[package](../AGENTS.md)、[root](../../AGENTS.md#conventions)。
