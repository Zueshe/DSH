# @deepseek-ai/dsh-session-usage

English | [中文](README.zh.md)

Dual-face package behind the web **Usage Statistics** surface: the Host half aggregates provider-reported token usage across the durable session corpus and serves it as a read-only same-origin JSON route; the browser half renders the settings section and a sidebar footer action that both fetch it. Time ranges (last 7 / 14 / 30 days, or a custom pair of dates) and a per-task breakdown (one row per session with its LLM-generated title) come out of one query.

## Aggregation semantics

- **Token source.** Each `assistant/message` event carries the step's `TokenUsage` when the adapter reported accounting. The fold counts exactly those events whose timestamp lands inside the inclusive `[from, to]` range and sums four disjoint buckets: uncached input, output, cache-read, and cache-write. `total` is the disjoint sum of all four, matching the `token-meter` billing convention.
- **Defensive reads.** Malformed or missing usage fields fold as zero, mirroring the `session-stats` guard.
- **Per-day buckets** use the host-local calendar date of each counted event, so a session spanning midnight splits across two dates.
- **Per-task rows** are sessions with at least one counted request, titled from the latest `session/title` event (`null` when the log has none), sorted by `total` descending.
- **Failure isolation.** Per-session log reads and title folds are isolated: a failed read increments `failedSessions` and the rest of the report still resolves; `scanned` reports how many sessions the corpus listed.

## Composition

```yaml
- id: session-usage
  name: '@deepseek-ai/dsh-session-usage'
```

Registered only in the `dsh-web-app` bundle. The Host half reads `sessionQuery` (provided by `session-query-sqlite` in the base bundle) and registers the `/api/session-usage` route on a mounted `webServer`; without a webServer it contributes nothing. The `dsh.client` manifest drives the browser half's settings section and its `sidebar.footer.action` entry, both sharing one controller.

## Model Experience

None, as the package only aggregates already-logged provider usage; it never touches a prompt, message, schema, stream, or tool result, and the route is read-only.

#### KV Cache effect

None; the package never assembles or sends provider requests.

## Known Limitations and Deferred Work

- **Reported usage only** — steps whose provider reported no `usage` record are invisible, so a cache that does not surface token accounting shows less than the true cost.
- **Host-local date buckets** — day boundaries follow the host time zone, not the browser's, so a deployment whose GUI and host differ in time zone buckets the edges of a day under the host calendar.
- **No per-model or per-provider breakdown yet** — the report aggregates across models; splitting by route is a natural extension of the same fold.
- **Mounted only in the web-app bundle** — other assemblies serve no usage route and no settings section.
