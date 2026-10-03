# LESSONS - auto-maintained by scripts/lessons.py

> Machine-owned. Do NOT hand-edit. Changes are overwritten on the next `lessons.py` write.
> Canonical state lives in `.specs/lessons.json`. Edit lessons only via the script.
> promote_threshold=2 distinct features · window_days=45 · quarantine_threshold=2

## Confirmed (load these at Specify/Design)

Corroborated across multiple features. Safe to apply as guidance.

_none_

## Candidates (under observation - do NOT load as guidance yet)

Seen once or not yet corroborated. Tracked, not trusted.

### L-001 - Dashboard read paths must carry an automated assertion that they never import or call the ERP/Millennium client, not only a code-review note
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `dashboard-read` · harmful: 0
- features: erp-sync-overview
- evidence: SYNC-05 (dashboard-read)
- last seen: 2026-09-21T13:52:03Z

### L-002 - Exported constants that the UI passes into file writers must be asserted directly, not re-typed in the writer's test.
- signal: `surviving_mutant` · recurrence: 1 feature(s) · scope: `src/data` · harmful: 0
- features: pedido-compra
- evidence: M6 src/data/wedash/purchaseOrder.ts:143 (src/data)
- last seen: 2026-10-03T11:18:11Z

### L-003 - When an AC treats 'empty or 0' as one case, put a zero-valued fixture in the tests.
- signal: `ac_gap` · recurrence: 1 feature(s) · scope: `tests` · harmful: 0
- features: pedido-compra
- evidence: PC-04 AC 8 (tests)
- last seen: 2026-10-03T11:18:11Z

## Quarantined (failed when applied - ignore)

A confirmed lesson that recurred alongside failure. Kept for the maintainer to review.

_none_
