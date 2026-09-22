# Vulnerability intelligence — Security

This is a tested baseline, not a claim that the catalogue is "secure".

## Authorization

No new permissions or roles. `vulnerabilities:read` was in the Phase 3 catalogue, reserved until
now and granted to everyone:

| Action | Permission | Owner | Admin | Security Analyst | Developer | Viewer |
|---|---|:-:|:-:|:-:|:-:|:-:|
| List, search, summary, detail | `vulnerabilities:read` | ✔ | ✔ | ✔ | ✔ | ✔ |
| Change the catalogue | — (no endpoint) | | | | | |
| Run ingestion | — (operator CLI on the server) | | | | | |

Decisions:
- **Every role can read.** Advisories are public information. Developers especially need them.
- **No organization role can write or trigger a sync.** The catalogue is shared by every tenant, so
  a per-organization role (even an owner) must not be able to alter what others see, or spend the
  platform's NVD quota. Ingestion is an operator action on the host (`npm run vulns:sync`), outside
  the web API. A platform-admin role doesn't exist, and this phase doesn't invent one.
- **Reads are not audited**, as with other catalogue reads. Ingestion runs are audited as system
  events (`vulnerability.sync`).

## The global-data boundary

- **No organization data in the catalogue:** no `organizationId`, no asset or software references.
  Nothing a tenant enters can reach this collection, and the catalogue never reveals anything about
  another tenant.
- **Ingestion input is operator-chosen:** IDs, packages, ecosystems or a file. The worker never
  derives what to fetch from tenants' inventories. If it did, one tenant's packages would leak into
  shared data that others can see.
- **Membership still gates access:** requests go through `requireMembership`, so a non-member
  organization ID is a `404`. Tested: two organizations get byte-identical responses, and neither
  can use the other's ID in the path.

## Untrusted source content

Advisory text comes from third parties and is treated as hostile.

| Risk | Control |
|---|---|
| Provider format changes / malformed records | Two validation layers: a provider-shape schema in each adapter, then a strict schema for our normalized shape (`advisory.js`). A failing record is counted as `invalid`, noted, and skipped. The run continues and nothing partial is stored. |
| Script / HTML in summaries or descriptions | Stored as text; React renders it as text. Descriptions are never rendered as HTML or Markdown. |
| Malicious links | References must parse as `http:`/`https:` URLs without credentials. `javascript:`, `data:`, `file:` and others are dropped at ingestion, and the schema re-checks. Links open with `rel="noopener noreferrer nofollow"`. |
| Control characters / terminal or log spoofing | Stripped from all text (tabs and newlines kept) |
| Oversized content | Per-field caps: description 20k, summary 400, 1,000 versions per package, 1,000 CPE entries, 300 references…, each with truncation flags where content is dropped |
| Bogus CVSS | Vectors fully validated. v2/v3 scores are recomputed, so a wrong or hostile source score can't change severity. An invalid vector is dropped rather than guessed. |
| Stale or replayed data | An older `modifiedAt` never overwrites a newer record |

## Outbound requests

- **Fixed hosts:** the hosts are constants, and no URL comes from a user, an organization or
  advisory content. That removes SSRF from this design.
- **Hard limits:** timeouts, streamed response-size caps, refused redirects, bounded retries, and
  NVD rate spacing.
- **The NVD API key:**
  - read only by the worker (`config/ingestion.js`), never by the web API
  - sent only to NVD, as a header, never in a URL
  - never logged, and absent from run errors, which carry host and path only (tested)
  - documented as secret in `.env.example`, which ships an empty value

## Query safety

| Risk | Control |
|---|---|
| NoSQL operator injection | Query strings parsed by Express's simple parser (`severity[$ne]` stays a literal, ignored key); zod enums for every filter; `q` is a string ≤ 100 |
| Text-search syntax abuse | `$text` operators (`-negation`, `"phrases"`) are stripped, so words are literal |
| ID lookup | `ADVISORY_ID` pattern before any query; case-insensitive via `idKeys`, not regex |
| Resource use | page size ≤ 100; list items omit heavy arrays (a projection with counts); related records ≤ 20 |

## Verification

- **Backend tests** (55 across `cvss`, `vulnerabilityAdapters`, `vulnerabilityIngestion`,
  `vulnerabilities`, `vulnerabilitySecurity`):
  - CVSS scores against NVD's published values; malformed vectors
  - both adapters against **real, trimmed NVD and OSV payloads**, and a deliberately hostile record
  - idempotency, stale-copy protection, invalid-record isolation
  - cursors (per ecosystem), 120-day windows and paging, failure without cursor movement
  - locking and crash recovery, NVD-key isolation, OSV CSV early stop
  - HTTP retries, caps and error sanitization
  - API search, filters, sort, pagination, detail, related records and summary
  - every role reading, no write routes (404 for POST/PATCH/DELETE), the global-data equality
    between organizations, 401s, operator-syntax handling, hostile content served cleaned
- **Live:**
  - real NVD and OSV syncs on an isolated stack
  - browser verification at 360 / 768 / desktop, reduced motion, role checks and the console

## Known limitations

- **No scheduler.** Runs are CLI-driven until the background-jobs phase. Use the host's cron (see
  [ingestion.md](./ingestion.md#scheduling)).
- **No full NVD mirror by default.** An incremental run needs a start date the first time.
  Mirroring all of NVD (~250k CVEs) takes hours without an API key; the NVD JSON feeds can be
  imported with `--file` instead.
- **OSV incremental is per ecosystem,** and only the eight ecosystems the software inventory knows
  have a mode. Other OSV ecosystems arrive only through `--ids`, `--package` or `--file`.
- **CVSS v4 scores** are not computed when a source gives only a vector.
- **CPE configurations are flattened:** AND/platform conditions are dropped (the UI says so).
- **Rejected/withdrawn records are kept** (filtered out by default) so history and future findings
  stay explainable. A record NVD *deletes* outright is not detected.
- **Search:**
  - keyword search uses a MongoDB text index: English stemming, no fuzzy matching or prefixes
  - ID search is exact
  - pagination is offset-based
- **The summary** aggregates on every request (no caching).
- **Related records** are one hop and capped at 20.
- **The audit UI** is a later phase. Sync events are in the audit log and the run log.
