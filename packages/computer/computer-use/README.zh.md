# @deepseek-ai/dsh-computer-use

[English](README.md) | 中文

计算机使用（computer-use）能力缝。`ctx.computerUse` 暴露一个共享的可控界面，包含四个操作——`navigate`、`observe`、`click`、`type`——每个操作都返回完整的操作后观察结果（PNG 截图、界面地址、界面标题）。类型与语义记录在 [docs/subsystems/computer-use.zh.md](../../../docs/subsystems/computer-use.zh.md)。

本缝没有注册表也没有选择逻辑：每个组合由一个 provider 提供服务，因此 `ctx.computerUse` 解析为该 provider 的实例，或者保持缺失。操作按契约串行，因为它们会修改共享界面。失败以带封闭错误码（`COMPUTER_USE_LAUNCH_FAILED`、`COMPUTER_USE_ACTION_FAILED`）的 `ComputerUseError` 上抛；每个操作都接受可选的取消信号。

## Model Experience

Indirectly, through dsh-tool-computer-use, which renders every observation this seam returns.

#### KV Cache effect

The seam adds no request content of its own and does not invalidate any reusable prefix.

## Known Limitations and Deferred Work

- **One surface per composition** — the seam models a single shared surface; concurrent agents serialize on it. A per-session or per-agent surface needs a registry owner and a consumer that names its target.
- **No scroll, drag, or key actions** — the closed action set covers navigate/observe/click/type only; a provider can offer more, but the seam and tool do not carry it yet.
