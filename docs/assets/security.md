# Assets — Security

This is a tested baseline, not a claim that the inventory is "secure".

## Authorization

Permissions are the Phase 3 catalogue (`server/src/config/roles.js`); no new permissions or role
checks were added.

| Action | Permission | Owner | Admin | Security Analyst | Developer | Viewer |
|---|---|:-:|:-:|:-:|:-:|:-:|
| List, search, summary, view | `assets:read` | ✔ | ✔ | ✔ | ✔ | ✔ |
| Create | `assets:create` | ✔ | ✔ | ✔ | | |
| Edit fields and lifecycle status | `assets:update` | ✔ | ✔ | ✔ | | |
| Archive, restore, permanently delete | `assets:delete` | ✔ | ✔ | | | |

Decisions:
- **Removal is a management action.** Archive and restore map to `assets:delete` because both
  change what is in the organization's inventory. Analysts can still mark a system `retired` via
  `assets:update`.
- **Permanent delete needs two steps:** archive, then delete. The UI also requires typing the asset name.
- **Contacts are shown by name only.** Every role can read assets, and developers and viewers lack
  `members:read`, so asset responses never include member emails.
- **Denied state-changing requests** are audited as `authorization.denied` (existing middleware).

## Tenant isolation

- **Membership first:** every route resolves `:organizationId` (id or `current`) to an active
  membership before anything else. Non-members get 404.
- **Scoped queries:** every query filters `organizationId` from that membership, and asset lookups
  are `{ _id, organizationId }`. Another tenant's asset id is simply not found (404, same body as a
  nonexistent id).
- **Scoped side effects:** search, filters, tags and summary run inside the organization. Identifier
  uniqueness and the contact-membership check are per organization; they never reveal that an
  identifier or person exists elsewhere.
- **No client tenant ids:** `organizationId` in a body is ignored, and ids are shape-checked
  (`isObjectIdString`) before querying.

## Validation and injection

| Risk | Control |
|---|---|
| NoSQL operator injection (`{ "$gt": "" }`) | zod schemas admit only primitives/arrays of primitives; tested on bodies; unknown query keys ignored |
| Regex injection / ReDoS via search | `q` is regex-escaped and length-capped (100); matched literally (tested with `.*` and `(`) |
| Mass assignment | unknown keys stripped; server sets tenant, provenance, archive state, revision, rank (tested) |
| Dangerous URLs | `url` identifiers must be `http(s)` without credentials; identifiers are rendered as text, never links |
| Control characters / log or UI spoofing | rejected in names, team, technologies and identifiers |
| Oversized input | per-field caps, list caps, 10 KB JSON body limit (existing) |
| Query tampering | enum lists, sort allowlist, page and pageSize bounds; repeated keys rejected |
| Lost updates | `revision` optimistic concurrency, atomic conditional update |
| Resource exhaustion | 600 writes per hour per organization; 10,000 assets per organization; page size ≤ 100 |
| CSRF | existing Origin guard on all non-GET methods (tested for POST and DELETE) |

## Audit

| Action | Details recorded |
|---|---|
| `asset.create` | `resourceType: 'asset'`, `resourceId`, `metadata.changes` (type, environment, criticality, exposure, status) |
| `asset.update` | `metadata.fields` (changed field names) + `metadata.changes` (before/after for enumerated fields only) |
| `asset.archive` / `asset.restore` | resource reference |
| `asset.delete` | resource reference + the deleted asset's type, environment and criticality |
| `authorization.denied` | permission and role for denied writes |

Free text (names, descriptions, identifiers) is not copied into audit logs.

## Verification

- **Backend tests** (`server/tests/assets*.test.js`) cover:
  - identifier normalization
  - validation and mass assignment
  - duplicate identifiers, including under concurrency
  - contact membership
  - optimistic concurrency and lifecycle
  - archive, restore and delete
  - search, filters, sort, pagination and summary
  - query validation
  - the full role matrix, and role changes taking effect on the next request
  - cross-tenant reads and writes by organization id and by asset id
  - organization switching, CSRF, 401s, rate limiting
- **Live browser run:** viewer and analyst sessions, crafted `fetch` calls, and a foreign asset URL.
  Results are in the Phase 4 report.

## Known limitations

- **Search** is a case-insensitive regex over an organization's assets, not a text index. Fine at
  current scale; a text or Atlas Search index can come later.
- **Pagination** is offset-based. Deep pages cost more, and concurrent inserts can shift pages.
  Cursor pagination can be added without changing the filters.
- **Summary counts** come from an aggregation per request (no caching).
- **Tag filter** accepts a single tag. The API accepts lists for enumerated filters, but the UI sends one value per filter.
- **No bulk import or export**, and no bulk edit.
- **No per-asset history view**. Events are in the audit log; the audit UI is a later phase.
- **Delete doesn't yet check references.** Nothing references assets today; this must change when findings or software inventory arrive.
- **Local development cookies:** browsers share cookies across ports on `localhost`. Two local
  VulnTrack stacks (e.g. `:5173` and `:5174`) sign each other out. Use `127.0.0.1` for a second
  stack. This doesn't affect deployments.
