# @deepseek-ai/dsh-computer-use

English | [中文](README.zh.md)

The computer-use seam. `ctx.computerUse` exposes one shared controllable surface with four operations — `navigate`, `observe`, `click`, `type` — each returning the complete post-action observation (PNG screenshot, surface address, surface title). Types and semantics are documented on [docs/subsystems/computer-use.md](../../../docs/subsystems/computer-use.md).

There is no registry and no selection: one provider per composition provides the service, so `ctx.computerUse` resolves to that provider's instance or stays absent. Actions are sequential by contract because they mutate the shared surface. Failures are `ComputerUseError` with a closed code (`COMPUTER_USE_LAUNCH_FAILED`, `COMPUTER_USE_ACTION_FAILED`); every operation accepts an optional cancellation signal.

## Model Experience

Indirectly, through dsh-tool-computer-use, which renders every observation this seam returns.

#### KV Cache effect

The seam adds no request content of its own and does not invalidate any reusable prefix.

## Known Limitations and Deferred Work

- **One surface per composition** — the seam models a single shared surface; concurrent agents serialize on it. A per-session or per-agent surface needs a registry owner and a consumer that names its target.
- **No scroll, drag, or key actions** — the closed action set covers navigate/observe/click/type only; a provider can offer more, but the seam and tool do not carry it yet.
