# Agent Note: Usage Statistics reuses unchanged logs through revision-gated samples

Status: implemented

English | [中文](2026-08-16-session-usage-revision-gated-sample-cache.zh.md)

## Problem

Every Usage Statistics query — each panel open, range switch, and refresh click — re-read and re-folded the complete corpus: `collectUsageReport` listed the sessions, read each full log with bounded parallelism, and then `readTitleSnapshots` re-loaded every cold log a second time to fold titles. Two full corpus scans per open, linear in corpus size, and visibly slow on a real deployment ([the settings feature note](../feature/2026-08-14-session-usage-settings.md) had deferred the incremental design until exactly this need showed up).

## Decision

The host route owns one process-local `UsageSessionCache` for its fiber's lifetime and passes it to `collectUsageReport` beside the optional `sessionPersistence` service:

- Each read log reduces to compact per-request samples — timestamp, provider-model identity, four token counts — cached under the persistence revision that `SessionPersistence.listSnapshots()` reported for that read. The snapshot listing is a metadata walk (directory scan plus `stat`; dev/ino/size/mtimeNs/ctimeNs in the JSONL revision), so a query re-lists revisions cheaply and serves a cached row only on an exact match.
- The range fold runs over samples, not events. Samples carry millisecond timestamps, so any `[from, to]` refold of a cached session is exact — including the preset ranges whose `to` is `Date.now()` mid-day, which day-keyed buckets cannot reproduce. `aggregate.ts` therefore splits into `extractUsageSamples` (defensive reads unchanged) and `foldSessionSamples`; the single-event fold is gone, so the two stages cannot drift.
- Titles fold from the same read that produced the samples (`foldSessionTitle`) and cache with them; `readTitleSnapshots` no longer participates in the usage path, so one query never reads a log twice.
- Live sessions never enter the cache: their in-memory tail can outgrow the persisted revision, so they re-read every query (an in-memory snapshot, no disk I/O).
- Without `sessionPersistence`, without a cache, or when the snapshot listing fails, every session reads per query — the previous behavior, fail-soft.

## Alternatives considered

**A `sessionUsage` projection unit on `ctx.sessionProjections` with durable checkpoints** (the `sessionStats` pattern): rejected for this need — exact millisecond-precise ranges make the unit state an ever-growing per-request list rather than bounded counters, and the panel reads cold sessions across the whole corpus, so the win still depends on the projection cache's restore ladder. The revision-gated in-process cache reaches the same repeat-open win with no new persisted format; a durable checkpoint remains the follow-up if first-open-after-restart cost ever matters.

**TTL memoization of the assembled report per range**: rejected — a timer trades freshness for speed with no correctness story. Revisions invalidate exactly when a stored log changes, and live sessions re-read anyway, so there is nothing a TTL would buy except staleness.

**Clamping `to` to end-of-day so day-keyed buckets become refoldable**: rejected — reshaping the range contract to fit a cache representation, and custom ranges would still need exact edges. Samples are small (one row per counted request) and keep the fold honest.

## Consequences

- Repeat opens, range switches, and refresh clicks cost one corpus listing, one snapshot listing, and in-memory sample folds; unchanged logs are not read.
- The first query after host start still reads every in-range log once (the cache is process-local); documented as a known limitation in the package README.
- Active sessions pay a fresh live-snapshot read per query — correctness over skipping, bounded by how many sessions are live at once.
- Concurrent queries may duplicate a cold read (both miss before either stores); harmless, and the next query serves the row.
- The report's wire content is unchanged; only its cost profile moved.

## Testing

- Aggregate: extraction keeps one zero-valued sample per usage-carrying event and drops the rest; one extracted sample set refolds shifting ranges exactly.
- Query driver: a repeat query performs zero re-reads and returns an equal report; a changed revision re-reads only that session; a range switch refolds cached samples without reads; live sessions re-read at unchanged revisions; a missing cache, a session without a snapshot revision, and a failing snapshot listing all degrade to per-query reads.
- Cache unit: rows serve only at the exact stored revision, store replaces, prune drops unlisted sessions, dispose clears.
