# Agent Note: Usage Statistics — token-usage settings page over the session corpus

Status: implemented

English | [中文](2026-08-14-session-usage-settings.zh.md)

## Problem

The harness records provider-reported token usage in every `assistant/message` event, but nothing surfaces it: there is no way to see how many tokens a deployment has spent over a window or which sessions (tasks) consumed them. The request was a settings feature like Zcode's usage stats — total tokens over 7/14/30-day or custom ranges, plus a per-task breakdown.

A first attempt delivered the page as a dynamic Cordis plugin (a `settings.section` registration plus a `harness.handle` RPC). The host-side aggregation worked and was verified against the durable logs, but the dynamic-plugin browser half proved unreliable in the running deployment: `host.call` from a settings section never resolved, client timers did not fire, a fresh page did not load the dynamic client half at all, and run-card buttons did not render. The symptoms pointed at the dynamic-client runtime rather than the aggregation, so the permanent feature had to use the proven product client stack instead of the dynamic path.

## Decision

Ship a dual-face package `packages/session/session-usage` (`@deepseek-ai/dsh-session-usage`) registered only in the `dsh-web-app` bundle:

1. **Host half.** Reads the durable corpus through the existing `sessionQuery` service (`listSessions` → `readSession` per session, titles folded in the same read), folds provider usage from `assistant/message` events inside the inclusive range, and registers a read-only same-origin JSON route `/api/session-usage` on a mounted `webServer` (`ctx.get('webServer')`, optional — without a webServer the package contributes nothing). Per-session read failures are isolated and counted as `failedSessions`; title folds are best-effort.
2. **Browser half.** A `settings.section` entry (`id: 'usage-stats'`) whose component fetches the route through a small controller, renders range presets (7/14/30 days or a custom date pair), summary cards (total/input/output/cache-read/cache-write tokens, requests, sessions, cache hit rate), a per-day bar list, a per-model table, and a per-task table with a search filter. Copy is registered through the locale service (zh/en). The section shares the presentation body and one controller with a `sidebar.footer.action` entry (`id: 'usage-stats'`): a footer trigger above the Settings seat that opens an independent popup rendering the same body, so usage is reachable from any surface without opening Settings. The body is the shared `UsagePanel` component; the section and the footer action are thin wrappers over it.

The aggregation is split into pure folds (`aggregate.ts`, unit-tested directly) and a corpus driver (`query.ts`, tested against a fake `SessionQueryEngine`); the route and its range parsing live in `index.ts`.

**Token semantics.** `total` is the disjoint sum of input + output + cache-read + cache-write, matching the `token-meter` billing convention. Only events with a provider-reported `usage` count; malformed fields fold as zero, mirroring the `session-stats` guard. Day buckets use the host-local calendar date of each counted event. Model buckets key on the counted event's assistant-message `source` identity - `provider` plus `model`, so two providers serving the same model id stay separate - and unreadable identity fields fold into one `unknown/unknown` row; rows merge across sessions and sort by `total` descending.

## Consequences

- The settings page appears only in web-app assemblies; other surfaces have no usage route or section.
- The sidebar footer entry gives any surface a one-click route to usage, at the cost of a second nav seat sharing the same section id (`usage-stats`) across two slots — the ids need not collide because each lives in its own slot.
- Browsing usage reads each log at most once per stored-log revision: repeat queries and range switches refold cached per-request samples, and only changed logs plus live sessions re-read with bounded parallelism (`SESSION_USAGE_READ_CONCURRENCY = 6`) — the [revision-gated sample cache](../architecture/2026-08-16-session-usage-revision-gated-sample-cache.md). The first query after host start still scans the in-range corpus once.
- The route is intentionally outside the `/api` RPC envelope — it is a physical no-envelope GET, like `/api/session.export`, so adding it did not touch the `IApiClient`/api-proxy contract.

## Testing

- Pure fold tests: bucket sums, range filtering, defensive malformed usage and model identities, empty logs, report assembly ordering, date keys.
- Corpus driver tests against a fake engine: empty corpus, titles attached, sessions created after the range skipped without reads, failed reads counted, title failures contained.
- Route parsing tests and client controller tests (URL shape, 2xx parse, non-2xx error).
- Component tests (jsdom): cards/day/model/task rendering, error surface, empty state, search narrowing, `resolveRange` math, and the footer action (trigger label, popup open, close via close button / mask / Escape).

## Alternatives considered

**Keep fixing the dynamic-plugin browser half.** Rejected for the permanent feature: the symptoms (never-resolving `host.call`, non-firing client timers, unloaded client halves in fresh pages) pointed at the dynamic-client runtime, not the page code, and the permanent feature must not ride a fragile path.

**Expose the query as a new `IApiClient` method through `dsh-host-apiproxy`.** Rejected: adding a Remote method to the unified API touches the client contract, the `WebApiClient`, and the fixture surface across the connection stack — a much larger blast radius than one physical route for a single read-only consumer.

**A `sessionUsage` Cordis Service (class) with an `@Remote` method.** Deferred: the only current consumer is the settings page, so the aggregation lives in exported pure functions plus a route handler; a service class can wrap the same folds later without a contract change.

**A `settings.general.item` row instead of a full section.** Rejected: the feature is a whole page, not one preference; `settings.section` is the documented seat for a full settings UI.

## Risks

**Cold-start and changed-log reads scale linearly.** The first query after host start reads every in-range log once, and each stored-log change re-reads that log; the bounded pool keeps it bounded per session and the report stays correct. The revision-gated in-process cache ([follow-up note](../architecture/2026-08-16-session-usage-revision-gated-sample-cache.md)) covers repeat queries; a durable checkpoint cache remains the follow-up if restart-frequency makes cold starts matter.

**Host-local date bucketing.** Day boundaries follow the host time zone, so a GUI and host in different zones bucket day edges under the host calendar; documented as a known limitation.
