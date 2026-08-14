# Agent Note: Usage Statistics — token-usage settings page over the session corpus

Status: implemented

English | [中文](2026-08-14-session-usage-settings.zh.md)

## Problem

The harness records provider-reported token usage in every `assistant/message` event, but nothing surfaces it: there is no way to see how many tokens a deployment has spent over a window or which sessions (tasks) consumed them. The request was a settings feature like Zcode's usage stats — total tokens over 7/14/30-day or custom ranges, plus a per-task breakdown.

A first attempt delivered the page as a dynamic Cordis plugin (a `settings.section` registration plus a `harness.handle` RPC). The host-side aggregation worked and was verified against the durable logs, but the dynamic-plugin browser half proved unreliable in the running deployment: `host.call` from a settings section never resolved, client timers did not fire, a fresh page did not load the dynamic client half at all, and run-card buttons did not render. The symptoms pointed at the dynamic-client runtime rather than the aggregation, so the permanent feature had to use the proven product client stack instead of the dynamic path.

## Decision

Ship a dual-face package `packages/session/session-usage` (`@deepseek-ai/dsh-session-usage`) registered only in the `dsh-web-app` bundle:

1. **Host half.** Reads the durable corpus through the existing `sessionQuery` service (`listSessions` → `readSession` per session → `readTitleSnapshots`), folds provider usage from `assistant/message` events inside the inclusive range, and registers a read-only same-origin JSON route `/api/session-usage` on a mounted `webServer` (`ctx.get('webServer')`, optional — without a webServer the package contributes nothing). Per-session read failures are isolated and counted as `failedSessions`; title folds are best-effort.
2. **Browser half.** A `settings.section` entry (`id: 'usage-stats'`) whose component fetches the route through a small controller, renders range presets (7/14/30 days or a custom date pair), summary cards (total/input/output/cache-read/cache-write tokens, requests, sessions), a per-day bar list, and a per-task table with a search filter. Copy is registered through the locale service (zh/en).

The aggregation is split into pure folds (`aggregate.ts`, unit-tested directly) and a corpus driver (`query.ts`, tested against a fake `SessionQueryEngine`); the route and its range parsing live in `index.ts`.

**Token semantics.** `total` is the disjoint sum of input + output + cache-read + cache-write, matching the `token-meter` billing convention. Only events with a provider-reported `usage` count; malformed fields fold as zero, mirroring the `session-stats` guard. Day buckets use the host-local calendar date of each counted event.

## Consequences

- The settings page appears only in web-app assemblies; other surfaces have no usage route or section.
- Browsing usage is O(corpus) per query — every session log is read and folded on each request, with bounded parallelism (`SESSION_USAGE_READ_CONCURRENCY = 6`). The current corpus answers in ~5s; large deployments may want an incremental projection later.
- The route is intentionally outside the `/api` RPC envelope — it is a physical no-envelope GET, like `/api/session.export`, so adding it did not touch the `IApiClient`/api-proxy contract.

## Testing

- Pure fold tests: bucket sums, range filtering, defensive malformed usage, empty logs, report assembly ordering, date keys.
- Corpus driver tests against a fake engine: empty corpus, titles attached, sessions created after the range skipped without reads, failed reads counted, title failures contained.
- Route parsing tests and client controller tests (URL shape, 2xx parse, non-2xx error).
- Component tests (jsdom): cards/day/task rendering, error surface, empty state, search narrowing, `resolveRange` math.

## Alternatives considered

**Keep fixing the dynamic-plugin browser half.** Rejected for the permanent feature: the symptoms (never-resolving `host.call`, non-firing client timers, unloaded client halves in fresh pages) pointed at the dynamic-client runtime, not the page code, and the permanent feature must not ride a fragile path.

**Expose the query as a new `IApiClient` method through `dsh-host-apiproxy`.** Rejected: adding a Remote method to the unified API touches the client contract, the `WebApiClient`, and the fixture surface across the connection stack — a much larger blast radius than one physical route for a single read-only consumer.

**A `sessionUsage` Cordis Service (class) with an `@Remote` method.** Deferred: the only current consumer is the settings page, so the aggregation lives in exported pure functions plus a route handler; a service class can wrap the same folds later without a contract change.

**A `settings.general.item` row instead of a full section.** Rejected: the feature is a whole page, not one preference; `settings.section` is the documented seat for a full settings UI.

## Risks

**Per-query corpus reads scale linearly.** For large corpora this is the main cost; the bounded pool keeps it bounded per session and the report stays correct. A projection cache is the natural follow-up but was deliberately omitted until a deployment shows the need.

**Host-local date bucketing.** Day boundaries follow the host time zone, so a GUI and host in different zones bucket day edges under the host calendar; documented as a known limitation.
