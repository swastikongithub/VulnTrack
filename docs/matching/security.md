# Matching — Security

This is a tested baseline, not a claim that matching is "secure".

## Authorization

No new permissions; the Phase 3 catalogue already had both.

| Action | Permission | Owner | Admin | Security Analyst | Developer | Viewer |
|---|---|:-:|:-:|:-:|:-:|:-:|
| List, summary, detail | `vulnerabilities:read` | ✔ | ✔ | ✔ | ✔ | ✔ |
| Recalculate | `findings:create` | ✔ | ✔ | ✔ | | |
| Edit or delete a match | — (no endpoint) | | | | | |

Decisions:
- **Everyone reads.** A match is information about software the organization already records, and
  developers are the people who act on it.
- **Recalculation is `findings:create`.** It is the step that produces what findings will be made
  from, and it reads the entire inventory; that belongs to the security team rather than to every
  reader. Denied attempts are audited as `authorization.denied`.
- **Matches can't be edited.** There is no "mark as false positive" in this phase: that is a
  finding decision, and inventing it here would create a workflow the next phase has to migrate.

## Tenant isolation

- **Matches are tenant-owned.** Every query filters `organizationId`; a match id from another
  organization is a `404`, and so is another organization's id in the path.
- **A filter can't probe another tenant.** `?assetId=<foreign id>` returns an empty list, not an
  error that would confirm the asset exists.
- **The global catalogue stays global.** Advisories are shared, but *that this organization runs an
  affected package* is private: two organizations with identical inventories get separate rows, and
  neither can see the other's.
- **Runs are per organization** and locked per organization, so one tenant's recalculation can't
  block or observe another's.
- Tested: two organizations with the same inventory, cross-organization reads, recalculation
  through a foreign organization id, and the asset-filter probe.

## Validation and injection

| Risk | Control |
|---|---|
| NoSQL operator injection | zod enums for every filter; `assetId`/`vulnerabilityId` must be 24-hex; `severity[$ne]=…` stays a literal, ignored parameter |
| Regex injection / ReDoS via search | `q` is regex-escaped, capped at 100 characters, matched literally (tested with `.*`) |
| Mass assignment | there is no write body: recalculation takes `{}` |
| Untrusted advisory text | summaries are copied from the catalogue, where they were already cleaned (Phase 6); rendered as text |
| Resource exhaustion | recalculation is rate-limited (12/hour per organization), serialized by a lock, batched, and capped at 200,000 matches per organization |
| Runaway evaluation | comparators are total functions: unparseable input returns `null` instead of throwing or looping |
| CSRF | existing Origin guard on `POST` (tested) |
| Stale or orphaned data | matches are deleted with their component or asset, follow archive state, and are pruned by every run |

## Audit

| Action | Details |
|---|---|
| `matching.run` | `organizationId`, the actor when a person triggered it, `resourceType: 'matching_run'`, `resourceId`, `reason` = status, `metadata.count` = created + updated |
| `authorization.denied` | permission and role for refused recalculations |

Reads are not audited, as with the other catalogues. The run log (`matchingruns`) keeps full counts
per run.

## Verification

- **Backend tests** (53, in `versionCompare`, `matchEngine`, `matching`, `matchingSecurity`):
  - comparator conformance per scheme, plus antisymmetry/transitivity, and the explicit
    string-comparison trap (`1.9.0` vs `1.10.0`)
  - range semantics: exclusive `fixed`, inclusive `lastAffected`, lower bounds, open-ended and
    multi-interval ranges, explicit version lists, `GIT` ranges, unparseable bounds
  - unknown versions never resolving to affected or safe
  - each installed version of a package evaluated independently
  - idempotent runs, pruning, cascade on component/asset change, archive/restore, rename
  - withdrawn advisories dropping their matches
  - CPE route for other software
  - lock, stale-run recovery, audit, empty inventory and empty catalogue
  - API filters, sorts, pagination, detail, summary, invalid parameters
  - the full role matrix, tenant isolation, absent write endpoints, operator-syntax handling,
    literal search, rate limiting, CSRF, 401s, and the absence of internal fields in responses
- **Live browser run:** matches page, detail page, asset and advisory panels, recalculation as
  analyst and refusal as viewer, at 360/768/desktop, with reduced motion. Results are in the
  Phase 7 report.

## Known limitations

- **No scheduler.** Matching runs on demand (UI or CLI); results are as fresh as the last run, and
  the page says when that was.
- **Whole-organization recomputation.** Simple and convergent, but an organization with a very
  large inventory pays for a full pass each time. Incremental recomputation by changed
  `componentKey` is the obvious next step.
- **`generic` software** has no version order, so CPE version *ranges* are reported as
  `undetermined` rather than decided, and product-name-only matches are low confidence.
- **CPE matching is product-level:** NVD's AND/platform conditions were flattened during ingestion.
- **Only the eight registry ecosystems** the inventory knows can match by package identity;
  advisories for Debian, Alpine and similar ecosystems have no `componentKey` to join on.
- **Severity is copied** from the advisory for sorting. It is technical severity, not risk.
- **No false-positive suppression**, by design: that is a finding decision.
- **Matches for archived assets** are kept but hidden by default, so restoring an asset doesn't
  silently lose its exposure history.
