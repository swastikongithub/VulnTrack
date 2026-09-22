# Ingestion

How public advisories get into the catalogue (master plan §28, §37). Operator-facing.

```
Public source ──► Fetch ──► Validate (provider shape) ──► Normalize ──► Validate (our schema) ──► Store
   NVD / OSV      adapter     adapter                      adapter      advisory.js               vulnerabilityStore.js
```

## Running it

```bash
cd server
npm run vulns:sync -- --source <nvd|osv> [mode] [options]
```

| Mode | Command | Fetches |
|---|---|---|
| Incremental (NVD) | `--source nvd --since 2026-09-01` | every CVE modified since the date, in ≤120-day windows of up to 2,000 per page |
| Incremental, resumed | `--source nvd` | since the last successful incremental run's cursor |
| Incremental (OSV) | `--source osv --ecosystem npm --since 2026-09-01` | advisories in one ecosystem modified since the date, via OSV's `modified_id.csv` index |
| By ID | `--source nvd --ids CVE-2021-44228,CVE-2021-45046` · `--source osv --ids GHSA-35jh-r3h4-6jhm` | those records (up to 500) |
| By package (OSV) | `--source osv --package npm:lodash` | every OSV advisory for the package (paged) |
| File import | `--source nvd --file feed.json` · `--source osv --file records.json` | a saved NVD API page or JSON 2.0 feed; an OSV record, array of records, or query response. No network. |

- **Ecosystems:** `npm`, `pypi`, `maven`, `nuget`, `go`, `cargo`, `rubygems`, `packagist`, the
  software inventory's values.
- **Package names:** validated with the inventory's own identity rules. `npm:bad name` is refused
  before any request.
- **Summary:** the run prints fetched / created / updated / unchanged / invalid counts, up to 10
  per-record problems, and the run ID.
- **Exit codes:** 0 succeeded or partial · 1 failed · 2 bad usage, or another run of that source
  in progress.

### Configuration

The worker reads `server/.env` and only needs:

| Variable | |
|---|---|
| `MONGODB_URI` | required |
| `NVD_API_KEY` | optional, **secret**. Raises NVD's limit from 5 to 50 requests per 30 s ([request one](https://nvd.nist.gov/developers/request-an-api-key)). Sent only to NVD, as its `apiKey` header. |
| `LOG_LEVEL`, `LOG_PRETTY` | optional |

It deliberately doesn't load the API's configuration: no cookies, origins or auth secret.

## Runs, cursors and locking

Every invocation writes a `VulnerabilitySyncRun`:

```
running ──► succeeded   everything stored
        ──► partial     finished; some records invalid, or requested IDs not found
        ──► failed      source/network/format failure; stopped
```

- **Counts:** `fetched`, `created`, `updated`, `unchanged`, `invalid`; `problems` holds up to 50
  per-record messages. No raw payloads are stored.
- **Idempotency:** each record is upserted on `(source, sourceId)`. A content hash separates
  *updated* from *unchanged*. An **older** copy (lower `modifiedAt`) never overwrites a newer one,
  which protects against stale files and reordered feeds.
- **Cursor:** an incremental run stores its window end (`cursor.modifiedUntil`, per ecosystem for
  OSV) **only if it didn't fail**. A failed run leaves the cursor where it was, and the next run
  re-does the window. That is safe because writes are idempotent.
- **First run:** an incremental run with no cursor and no `--since` is refused. This avoids an
  accidental download of the whole NVD (≈250k CVEs).
- **Lock:** a partial unique index allows one `running` run per source (NVD and OSV can run in
  parallel). A second invocation exits with code 2.
- **Crash recovery:** runs record a heartbeat. A `running` run silent for 30 minutes is marked
  `failed` ("Abandoned") by the next run of that source before it starts.
- **Audit:** each finished run writes `vulnerability.sync` to the audit log. It is a system event
  (no user, no organization), with `outcome`, `reason` = status,
  `resourceType: 'vulnerability_sync_run'` and `metadata.count` = created + updated.

## Outbound requests

`services/intelligence/httpClient.js`:

| Control | Value |
|---|---|
| Hosts | fixed in code: `services.nvd.nist.gov`, `api.osv.dev`, `osv-vulnerabilities.storage.googleapis.com`. No user- or organization-supplied URL is ever fetched. |
| IDs in URLs | validated against a strict advisory-ID pattern, then percent-encoded |
| Timeout | 60 s per request |
| Response cap | read as a stream and abandoned past the cap (NVD 128 MB, OSV 32 MB) |
| Retries | 3, exponential backoff from 2 s, for 429 / 5xx / network errors; `Retry-After` honoured (≤ 60 s) |
| Rate | NVD requests spaced 6.5 s apart without a key, 0.7 s with one; OSV has 4 in flight |
| Redirects | refused |
| Errors | report host + path only, never query strings or headers |

The OSV incremental mode **streams** `modified_id.csv` (newest first) and stops reading at the
cursor. It does not download the whole index, which is several MB for npm.

## Scheduling

This phase ships **no scheduler**: Redis/BullMQ belongs to the background-jobs phase. Until then,
run the CLI from the host's scheduler. Each source needs its own entry, and OSV needs one entry per
ecosystem:

```cron
# every 2 hours, after an initial --since run for each
0 */2 * * *  cd /srv/vulntrack/server && npm run vulns:sync -- --source nvd
30 */2 * * * cd /srv/vulntrack/server && npm run vulns:sync -- --source osv --ecosystem npm
```

`runSync()` keeps all state in the database, so a later BullMQ worker can call it unchanged.
Overlapping runs are already refused by the lock.

## Adding a source

1. Write `adapters/<source>Adapter.js`: provider-shape zod schema, `normalize(raw)` →
   `finalizeAdvisory(draft)`, and the iterators the source supports (`byIds`, `incremental`,
   `byPackage`, `fromFile`).
2. Add the source to `VULNERABILITY_SOURCES` and to the runner's mode table.
3. Record real payloads as fixtures (`server/tests/fixtures/intelligence/`) and test the
   normalizer against them.

Nothing outside the adapter may depend on the provider's response format.
