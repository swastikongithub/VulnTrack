# Vulnerability intelligence

A global catalogue of public vulnerability advisories, ingested from **NVD** and **OSV**,
normalized into VulnTrack's own model (master plan §28–29). It is the second input the later
matching phase needs:

```
Asset ──► Software component ──┐
                               ├──► (Phase 7) matching ──► Finding
Public advisory (this phase) ──┘
```

| Document | Contents |
|---|---|
| [vulnerability-model.md](./vulnerability-model.md) | Schema, per-source records and aliases, CVSS and severity, affected packages and products, indexes, future hooks |
| [ingestion.md](./ingestion.md) | The worker and CLI: sources, modes, cursors, locking, rate limits, failure handling, scheduling |
| [api.md](./api.md) | Read-only endpoint contracts, query parameters, errors |
| [security.md](./security.md) | Authorization, the global-data boundary, untrusted content, outbound requests, tests, limitations |

UI rules: [../design-system/pages/vulnerabilities.md](../design-system/pages/vulnerabilities.md).

## What exists in this phase

- **Ingestion pipeline:** *Fetch → Validate → Normalize → Store*.
  - NVD CVE API 2.0: by CVE ID, or incrementally by last-modified window.
  - OSV: by ID, by package, or incrementally per ecosystem.
  - Offline file import for either source.
  - Every run is logged, locked per source, cursor-based, idempotent and audited.
- **Source adapters:** everything that knows a provider's response format lives in
  `services/intelligence/adapters/`. They produce one internal shape, which a strict schema
  validates before storage.
- **Catalogue model:**
  - one record per source advisory, linked by aliases
  - CVSS v2/v3.0/v3.1/v4.0 vectors, with v2/v3 base scores computed from the vector
  - headline technical severity, CWE weaknesses and references
  - affected packages (OSV ranges, as published) and affected products (NVD CPE)
  - CISA Known Exploited status
- **Read-only API** for every role: search by ID or text, filters, sort, pagination, a summary with
  per-source freshness, and a detail view with related records.
- **UI:**
  - a Vulnerabilities catalogue page and an advisory detail page
  - empty, loading and error states
  - responsive layouts and reduced motion

## Not in this phase

- No matching of advisories against software inventory, no "affected assets", and no findings.
- No risk scoring, remediation, scanning, Redis/BullMQ scheduling, notifications, analytics or AI.
- No version comparison anywhere: ranges are stored and displayed exactly as published.
- The model keeps what matching will need without committing to a matching algorithm:
  `componentKey` on affected packages uses the software inventory's own identity rules, and the
  range events are stored in order.

## Architecture

```
scripts/sync-vulnerabilities.js     operator CLI  (npm run vulns:sync)
services/intelligence/
  syncRunner.js                     the worker: lock, cursor, run log, audit
  adapters/nvdAdapter.js            NVD fetch + provider-shape validation + normalization
  adapters/osvAdapter.js            OSV fetch + provider-shape validation + normalization
  advisory.js                       shared cleaning helpers + strict normalized schema
  httpClient.js                     timeouts, size caps, retries, rate spacing
  vulnerabilityStore.js             idempotent upsert (content hash)
config/vulnerabilities.js           vocabularies, OSV ecosystem map, limits
config/ingestion.js                 worker-only config (MONGODB_URI, NVD_API_KEY)
utils/cvss.js                       vector parsing, base scores, severity bands
models/Vulnerability.js             global catalogue (no organizationId)
models/VulnerabilitySyncRun.js      run log + lock + cursor
services/vulnerabilityService.js    read-only list / summary / detail
routes/vulnerabilityRoutes.js       GET only
```

```
client/src/features/vulnerabilities/
  pages/VulnerabilityCatalogPage.jsx  /organization/vulnerabilities
  pages/VulnerabilityDetailPage.jsx   /organization/vulnerabilities/:source/:sourceId
  components/                         VulnerabilityToolbar, VulnerabilityResults,
                                      VulnerabilitySignals, SourceFreshness
  vulnerabilityCatalog.js, vulnerabilityQuery.js, vulnerabilityFormat.js
client/src/services/vulnerabilities/  vulnerabilityApi.js, vulnerabilityErrors.js
```

No new middleware, roles or permissions. `vulnerabilities:read` was already in the Phase 3
catalogue, granted to every role.
