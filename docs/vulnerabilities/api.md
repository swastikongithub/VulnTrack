# Vulnerability API

Base path `/api`. Common rules follow [../authentication/api.md](../authentication/api.md):
- session cookie
- `Cache-Control: no-store`, `X-Request-Id`
- structured errors

**Read-only.** There are no `POST`/`PATCH`/`DELETE` routes. The catalogue is written only by the
ingestion worker ([ingestion.md](./ingestion.md)).

| Method | Path | Permission |
|---|---|---|
| `GET` | `/organizations/:organizationId/vulnerabilities` | `vulnerabilities:read` |
| `GET` | `/organizations/:organizationId/vulnerabilities/summary` | `vulnerabilities:read` |
| `GET` | `/organizations/:organizationId/vulnerabilities/:source/:sourceId` | `vulnerabilities:read` |

**Why the organization is in the path of a global catalogue:**
- `vulnerabilities:read` belongs to a *membership*, like every other permission. The path's
  `:organizationId` (an id or `current`) is resolved to the caller's membership before the
  permission check.
- Non-members get `404`, as elsewhere.
- The **data returned is identical for every organization**. This also leaves room for the
  matching phase to add organization-specific views at the same paths.

## Error codes

No new codes.
- `400 VALIDATION_FAILED`: invalid query parameters (`fields` keyed by parameter).
- `401`, `403 FORBIDDEN`.
- `404 NOT_FOUND`: unknown record, unknown source, malformed ID or non-member organization, all
  answered alike.

## `GET …/vulnerabilities`

| Parameter | Values | Default |
|---|---|---|
| `q` | ≤ 100 chars. An advisory ID (`CVE-2021-44228`, `ghsa-…`) is matched **exactly**, case-insensitively, against IDs and aliases. Anything else is a keyword search over summaries, package and product names and descriptions; words are literal (`-` and quotes are not operators). | — |
| `severity` | `critical,high,medium,low,none,unknown` (one or a comma list) | — |
| `source` | `nvd`, `osv` | — |
| `ecosystem` | software ecosystems (`npm,pypi,…`): advisories with an affected package there | — |
| `status` | `active` \| `rejected` \| `withdrawn` \| `any` | `active` |
| `exploited` | `true`: only CISA Known Exploited | — |
| `sort` | `modified`, `published`, `severity`, `id` | `modified` |
| `order` | `asc` \| `desc` | `desc` (`asc` for `id`) |
| `page` | 1–10000 | 1 |
| `pageSize` | 1–100 | 25 |

→ `200 { vulnerabilities: [...], page, pageSize, total, totalPages, sort, order }`

List items are compact. They leave out descriptions, references, CVSS entries and the CPE list:

```json
{ "source": "osv", "sourceLabel": "OSV", "sourceId": "GHSA-35jh-r3h4-6jhm",
  "aliases": ["CVE-2021-23337", "CVE-2026-4800", "GHSA-r5fr-rjxr-66jc"], "aliasCount": 3,
  "cveIds": ["CVE-2021-23337", "CVE-2026-4800"],
  "summary": "Command Injection in lodash",
  "severity": "high", "severityLabel": "High", "cvssScore": 7.2,
  "status": "active", "statusLabel": "Active",
  "publishedAt": "2021-05-06T16:05:51.000Z", "modifiedAt": "2026-09-10T03:49:04.067Z",
  "knownExploited": false,
  "packages": [{ "ecosystem": "npm", "ecosystemLabel": "npm", "name": "lodash" }], "packageCount": 7,
  "products": [], "productCount": 0 }
```

Repeated parameters (`severity=a&severity=b`) are a `400`. Unknown parameter *names*, including
`severity[$ne]`-style keys, are ignored; the query parser keeps them as literal names.

## `GET …/vulnerabilities/summary`

```json
{ "total": 1204, "active": 1190, "knownExploited": 12,
  "bySeverity": { "critical": 80, "high": 402, "medium": 530, "low": 90, "none": 3, "unknown": 85 },
  "sources": [
    { "source": "nvd", "label": "NVD", "name": "National Vulnerability Database", "records": 800,
      "lastSyncedAt": "…", "lastSuccessAt": "…",
      "lastRun": { "status": "succeeded", "mode": "incremental", "startedAt": "…", "finishedAt": "…" } },
    { "source": "osv", "…": "…" } ] }
```

`bySeverity` and `knownExploited` count active records. `sources` comes from the ingestion run log.

## `GET …/vulnerabilities/:source/:sourceId`

`sourceId` is matched exactly, then case-insensitively (GHSA IDs are mixed-case).
→ `200 { vulnerability }`: the list fields plus:

| Field | |
|---|---|
| `description`, `sourceStatus`, `withdrawnAt` | |
| `sourceName`, `sourceUrl` | e.g. `https://nvd.nist.gov/vuln/detail/CVE-2021-44228` |
| `cvss[]` | `{ version, vector, baseScore, severity, severityLabel, assessedBy, primary }`, newest version first |
| `weaknesses[]` | CWE IDs |
| `references[]` | `{ url, type, typeLabel, tags }`, http(s) only |
| `affectedPackages[]` | `{ ecosystem, ecosystemLabel, sourceEcosystem, name, packageKey, purl, ranges, versions, versionsTruncated }` |
| `affectedProducts[]`, `affectedProductsTruncated` | CPE entries |
| `knownExploited` | `{ addedAt, dueAt, name, requiredAction }` or null |
| `firstSeenAt`, `lastSyncedAt` | our ingestion provenance |
| `related[]` | other catalogue records sharing any ID (list-item shape, ≤ 20) |

Internal fields (`_id`, `idKeys`, `contentHash`, `lastRunId`, `schemaVersion`) are never returned.
