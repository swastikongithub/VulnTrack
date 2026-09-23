# Vulnerability matching

Connects the two inventories built in earlier phases (master plan §30):

```
Software component (organization)          Advisory (global catalogue)
  ecosystem + canonical package key   ──►  affected packages / products
  installed version                        affected version ranges
                                 ↓
                    potential match, with a reason
                                 ↓
                        (Phase 8) Finding
```

| Document | Contents |
|---|---|
| [matching.md](./matching.md) | The engine: identity, version comparison, range evaluation, statuses, confidence, runs |
| [api.md](./api.md) | Endpoint contracts, query parameters, errors |
| [security.md](./security.md) | Authorization, tenant isolation, validation, audit, tests, limitations |

UI rules: [../design-system/pages/matches.md](../design-system/pages/matches.md).

## What exists in this phase

- **A matching engine** that is pure, deterministic and independently testable:
  canonical package identity, per-ecosystem version comparators, OSV range evaluation, and a CPE
  route for software outside a package registry.
- **Four outcomes**, never a silent guess: `affected`, `not_affected` (not stored),
  `unknown_version`, `undetermined` — each with a **confidence** and a structured **reason** the UI
  renders as a sentence.
- **Stored matches** per organization, recomputed by a run that is idempotent, locked, audited and
  pruning: `npm run matches:recompute` for operators, or Recalculate in the UI for the security team.
- **Read-only API** and three UI surfaces: the Matches page, a panel on each asset, and an
  "In your inventory" panel on each advisory.

## Not in this phase

**No findings.** A match is a potential link awaiting review; it has no owner, status workflow, due
date, comment or closure. Nothing here computes risk (the master plan keeps the risk model open
until this data exists, §32, §57), and there is no remediation, scanning, SBOM import, queue,
notification, analytics or AI.

The phase stops exactly where the plan's arrow does: *potentially affected asset* — the step
before *Finding*.

## Architecture

```
services/matching/
  versionCompare.js   one comparator per ecosystem version scheme (pure)
  rangeEvaluator.js   OSV introduced/fixed/lastAffected/limit ranges (pure)
  matchEngine.js      (component, advisory) → status + confidence + reason (pure)
  matchStore.js       idempotent upsert, prune
  matchRunner.js      per-organization run: lock, batches, counts, audit
config/matching.js    statuses, confidences, routes, limits
models/VulnerabilityMatch.js   stored matches (tenant-owned, derived)
models/MatchingRun.js          run log + lock
services/matchService.js       list / summary / detail / recalculate
routes/matchRoutes.js          GET ×3 + POST recalculate
scripts/recalculate-matches.js operator CLI
```

```
client/src/features/matches/
  pages/MatchesPage.jsx        /organization/matches
  pages/MatchDetailPage.jsx    /organization/matches/:matchId
  components/MatchesPanel.jsx  embedded on the asset and advisory pages
  components/                  MatchResults, MatchToolbar, MatchSignals
  matchCatalog.js, matchQuery.js
client/src/services/matches/   matchApi.js, matchErrors.js
```

No new permissions: reads use `vulnerabilities:read`, recalculation uses `findings:create`.

## Integration with earlier phases

Matches are derived data and never outlive their sources:

| Change | Effect |
|---|---|
| Component edited (identity or version) | its matches are dropped immediately, rebuilt by the next run |
| Component deleted | its matches are deleted |
| Asset archived / restored | its matches follow, and leave the default views |
| Asset renamed | the denormalized name is updated |
| Asset deleted | its matches are deleted in the same transaction |
| Advisory withdrawn or rejected | the next run prunes matches that referenced it |
