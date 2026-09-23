# Matching API

Base path `/api`. Common rules follow [../authentication/api.md](../authentication/api.md):
session cookie, `Origin` required on `POST`, `Cache-Control: no-store`, structured errors.

| Method | Path | Permission |
|---|---|---|
| `GET` | `/organizations/:organizationId/matches` | `vulnerabilities:read` |
| `GET` | `/organizations/:organizationId/matches/summary` | `vulnerabilities:read` |
| `GET` | `/organizations/:organizationId/matches/:matchId` | `vulnerabilities:read` |
| `POST` | `/organizations/:organizationId/matches/recalculate` | `findings:create` |

Matches are **tenant-owned**: every query is scoped to the caller's organization, so another
organization's match id is a `404`, exactly like an asset id.

There is no endpoint that edits or deletes a match. Matches are derived: they change by
recalculating, or by changing the software they describe.

## Error codes (new)

| Code | Status | Meaning |
|---|---|---|
| `MATCHING_IN_PROGRESS` | 409 | A run for this organization is already under way |
| `MATCHING_FAILED` | 503 | The run stopped before completing; previous matches are untouched |

Reused: `400 VALIDATION_FAILED`, `401`, `403 FORBIDDEN`, `404 NOT_FOUND`, `429 RATE_LIMITED`.

## `GET …/matches`

| Parameter | Values | Default |
|---|---|---|
| `q` | ≤ 100 chars, matched literally against package, advisory ID, asset name and summary | — |
| `status` | `affected`, `unknown_version`, `undetermined` (comma list) | — |
| `confidence` | `high`, `medium`, `low` | — |
| `severity` | advisory severity (`critical`…`unknown`) | — |
| `ecosystem` | software ecosystems | — |
| `exploited` | `true`: advisories on CISA's KEV list | — |
| `assetId`, `vulnerabilityId` | 24-hex ids, for the embedded panels and deep links | — |
| `archived` | `false` (live assets) \| `true` | `false` |
| `sort` | `severity`, `asset`, `package`, `detected` | `severity` |
| `page` / `pageSize` | 1–10000 / 1–100 | 1 / 25 |

→ `200 { matches: [...], page, pageSize, total, totalPages, sort }`

```json
{ "id": "…",
  "asset": { "id": "…", "name": "Payments API", "archived": false },
  "component": { "id": "…", "ecosystem": "npm", "ecosystemLabel": "npm", "name": "lodash",
                 "packageKey": "npm:lodash", "version": "4.17.15", "versionNormalized": "4.17.15" },
  "vulnerability": { "id": "…", "source": "osv", "sourceLabel": "OSV", "sourceId": "GHSA-35jh-r3h4-6jhm",
                     "summary": "Command Injection in lodash", "severity": "high", "severityLabel": "High",
                     "cvssScore": 7.2, "knownExploited": false },
  "status": "affected", "statusLabel": "Affected",
  "confidence": "high", "confidenceLabel": "High",
  "route": "package", "routeLabel": "Package identity",
  "reason": { "rule": "range", "rangeType": "SEMVER", "scheme": "semver", "introduced": "0",
              "end": "4.17.21", "endKind": "fixed" },
  "explanation": "Version 4.17.15 is at or above the first release and below 4.17.21.",
  "fixedVersions": ["4.17.21"],
  "firstDetectedAt": "…", "lastEvaluatedAt": "…" }
```

Internal fields (`_id`, `organizationId`, `runId`, `severityRank`, the flat `assetName`) are never
returned; the ids the UI needs are nested under the thing they identify.

## `GET …/matches/summary`

```json
{ "total": 42,
  "byStatus": { "affected": 30, "unknown_version": 9, "undetermined": 3 },
  "bySeverity": { "critical": 4, "high": 12, "medium": 10, "low": 3, "none": 0, "unknown": 1 },
  "byConfidence": { "high": 30, "medium": 9, "low": 3 },
  "knownExploited": 2, "affectedAssets": 5, "advisories": 18, "components": 120,
  "lastRun": { "id": "…", "status": "succeeded", "trigger": "api", "startedAt": "…", "finishedAt": "…",
               "counts": { "components": 120, "created": 4, "updated": 0, "unchanged": 38, "removed": 1 } } }
```

Counts cover live assets. `bySeverity` counts `affected` matches only — the severity of something
undecided would be misleading.

## `GET …/matches/:matchId`

The list shape plus the advisory context needed to check the decision:

| Field | |
|---|---|
| `component.purl`, `component.relationship`, `component.scope` | from the inventory record |
| `advisory.cveIds`, `advisory.description`, `advisory.weaknesses`, `advisory.publishedAt`, `advisory.modifiedAt` | |
| `advisory.affected[]` | the affected entries **for this package only**: `{ name, ranges, versions, versionsTruncated }` |

## `POST …/matches/recalculate`

Body `{}`. Recomputes the organization's matches and waits for the run to finish.

→ `202 { run: { id, status, counts: { components, candidates, evaluated, affected, unknownVersion, undetermined, created, updated, unchanged, removed }, startedAt, finishedAt } }`

- `409 MATCHING_IN_PROGRESS` if a run is already going (one per organization).
- `429` after 12 runs in an hour for one organization.
- `503 MATCHING_FAILED` if the run failed; existing matches are left as they were.
