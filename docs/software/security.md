# Software inventory — Security

This is a tested baseline, not a claim that the inventory is "secure".

## Authorization

Permissions are the Phase 3 catalogue (`server/src/config/roles.js`); **no new permissions** were
added.

| Action | Permission | Owner | Admin | Security Analyst | Developer | Viewer |
|---|---|:-:|:-:|:-:|:-:|:-:|
| List, search, summary, view | `assets:read` | ✔ | ✔ | ✔ | ✔ | ✔ |
| Add, edit, remove a component | `assets:update` | ✔ | ✔ | ✔ | | |

Decisions:
- **A component is part of its asset's record**, so maintaining it is `assets:update`, not
  `assets:create`/`assets:delete`. Adding a dependency is describing an existing asset more
  precisely; it doesn't add or remove anything from the inventory of things the organization owns.
- **No `software:*` permissions.** Inventing a parallel permission family for a sub-resource would
  double the role matrix without giving an administrator a decision they actually want to make
  separately. If a later phase needs software-only editors, the catalogue can grow then.
- **Denied state-changing requests** are audited as `authorization.denied` (existing middleware) —
  six entries in the role-matrix test.
- **Archived assets are read-only**, for every role: `actions.update`/`actions.delete` are false and
  the API answers `409 ASSET_ARCHIVED`. Capability flags and enforcement are asserted separately, so
  a UI that ignored the flags would still be refused.

## Tenant isolation

- **Membership first:** every route resolves `:organizationId` (id or `current`) to an active
  membership before anything else. Non-members get 404.
- **Scoped queries:** every query filters `organizationId` from that membership; component lookups
  are `{ _id, organizationId }` and asset lookups `{ _id, organizationId }`. Another tenant's
  component or asset id is simply not found (404, same body as a nonexistent id).
- **`assetId` is not a probe:** the list's `assetId` filter resolves the asset in the caller's
  organization first, so a foreign id returns 404 rather than an empty list — the two are
  indistinguishable otherwise, but a 404 is also what a nonexistent id returns.
- **Scoped side effects:** search, filters, summary and the duplicate check all run inside the
  organization. Duplicate detection never reveals that a package exists elsewhere.
- **No client tenant ids:** `organizationId` and `assetId` in a body are stripped; the asset comes
  from the URL. Ids are shape-checked before querying.
- **Tested** by creating two organizations and attempting every read and write across them by
  organization id and by component id.

## Validation and injection

| Risk | Control |
|---|---|
| NoSQL operator injection (`{ "$gt": "" }`) | zod schemas admit only primitives; tested on bodies and query values |
| Regex injection / ReDoS via search | `q` is regex-escaped and length-capped (100); matched literally (tested with `.*` and `(`) |
| Mass assignment | unknown keys stripped; the server sets tenant, asset, identity (`componentKey`, `versionNormalized`, `purl`), `source`, `assetArchived`, provenance and `revision` (tested) |
| Identity spoofing | canonical fields are **derived**, never accepted — a client can't claim `pkg:npm/express@4.18.2` while storing something else |
| Control characters / log or UI spoofing | rejected in names and vendors |
| Unbounded or nonsense versions | per-ecosystem version grammar; 64-character cap; `latest` and similar rejected |
| Oversized input | per-field caps, 10 KB JSON body limit (existing) |
| Query tampering | enum lists, sort allowlist, page and pageSize bounds |
| Lost updates | `revision` optimistic concurrency, atomic conditional update |
| Duplicate races | unique index, `11000` mapped to `409 SOFTWARE_COMPONENT_EXISTS` |
| Resource exhaustion | 1,200 writes per hour per organization; 1,000 components per asset; 50,000 per organization; page size ≤ 100 |
| CSRF | existing Origin guard on all non-GET methods (tested for POST, PATCH and DELETE) |
| Orphaned records | asset delete cascades in a transaction; archive/restore syncs `assetArchived` in a transaction |

The purl is built with each segment percent-encoded, so a name can't break the identifier's
structure. It is rendered as text in the UI, never as a link.

## Audit

| Action | Details recorded |
|---|---|
| `software.create` | `resourceType: 'software_component'`, `resourceId`, `metadata.assetId`, `metadata.changes` (ecosystem, package key, normalized version, relationship, scope) |
| `software.update` | `metadata.fields` (changed field names) + `metadata.changes` (before/after for the same enumerated and identity fields) |
| `software.delete` | resource reference + the removed component's identity |
| `asset.delete` | gains `metadata.count`: how many components were removed with the asset |
| `authorization.denied` | permission and role for denied writes |

Package identity is recorded because it is a controlled, bounded value. Vendor free text is not
copied into audit logs.

## Verification

- **Backend tests** (`server/tests/software*.test.js`, 28 tests) cover:
  - per-ecosystem identity normalization, purl construction and rejection of ill-fitting names and versions
  - unknown versions as a distinct state
  - validation and mass assignment
  - duplicates, including under concurrency
  - optimistic concurrency and ecosystem changes
  - archived assets being read-only and hidden from the live inventory
  - asset delete cascading to software, with the recorded count
  - search, filters, sort, pagination and summary
  - literal search text and invalid query parameters
  - the full role matrix and capability flags
  - cross-tenant reads and writes by organization id and by component id
  - operator injection, CSRF origin, and 401s
- **Live browser run:** analyst, developer and viewer sessions, a second organization, crafted
  `fetch` calls, archived-asset behaviour, and the create/edit/remove flows at 360px, 768px and
  desktop. Results are in the Phase 5 report.

## Known limitations

- **Search** is a case-insensitive regex over an organization's components, not a text index. Fine
  at current scale; a text or Atlas Search index can come later.
- **Pagination** is offset-based. Deep pages cost more, and concurrent inserts can shift pages.
- **Summary counts** come from an aggregation per request (no caching). At 50,000 components the
  `topPackages` grouping is the most expensive query in the phase.
- **No manifest or SBOM import, and no bulk edit.** Every component is entered by hand, which is
  the main practical limit on inventory size today. `source` reserves `import` and `scanner`.
- **A component can't be moved between assets.** Remove and re-add.
- **Versions are recorded and normalized, never compared.** There is no ordering, range or
  "is this affected" logic anywhere in this phase, by design.
- **Unknown versions are unmatched by design.** They are counted and surfaced, but a component with
  no version can't be checked against an affected range later.
- **`assetArchived` is denormalized.** It is kept in step transactionally; a direct database write
  to `assets` that bypasses the service would leave it stale.
- **No per-component history view.** Events are in the audit log; the audit UI is a later phase.
- **Local development cookies:** browsers share cookies across ports on `localhost`. Use `127.0.0.1`
  for a second local stack. This doesn't affect deployments.
