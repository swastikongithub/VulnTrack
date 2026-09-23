# Asset model

Collection: `assets` (`server/src/models/Asset.js`). Vocabularies and limits:
`server/src/config/assets.js`.

## Fields

| Field | Type | Set by | Notes |
|---|---|---|---|
| `organizationId` | ObjectId | server (from membership) | Tenant boundary; never read from the request |
| `name` | string 2–120 | client | Trimmed; control characters rejected; not unique (the same service can exist per environment) |
| `description` | string ≤ 2000 | client | Plain text, rendered as text |
| `type` | enum | client | See vocabularies |
| `environment` | enum | client | |
| `criticality` | enum | client | Business impact if compromised |
| `criticalityRank` | 1–4 | server | Derived from `criticality`, for severity-ordered sorting |
| `exposure` | enum, default `unknown` | client | Internet reachability |
| `status` | enum, default `active` | client | Lifecycle of the real system (transitions enforced) |
| `identifiers[]` | `{ kind, value, normalized }` ≤ 10 | client (`kind`, `value`) / server (`normalized`) | How the asset is recognised |
| `identifierKeys[]` | string | server | `kind:normalized`, the uniqueness and lookup key |
| `tags[]` | string ≤ 40, ≤ 20 | client | Lower-cased; `[a-z0-9][a-z0-9._:/-]*`; de-duplicated |
| `technologies[]` | string ≤ 60, ≤ 20 | client | Free-text labels ("Node.js"); case-insensitive de-duplication |
| `owner.team` | string ≤ 80 | client | |
| `owner.contactUserId` | ObjectId \| null | client | Must be an **active member of this organization** when set; re-checked on every read |
| `discovery.source` | enum, `manual` | server | `import`, `scanner` and `integration` are reserved |
| `discovery.externalId` | string \| null | server (reserved) | ID in the reporting system |
| `discovery.firstSeenAt` / `lastSeenAt` | date | server | `lastSeenAt` stays null until a scanner reports the asset |
| `archived`, `archivedAt`, `archivedBy` | | server | Soft removal from the inventory |
| `createdBy`, `updatedBy` | ObjectId | server | |
| `revision` | integer | server | Incremented by every write; updates must present it |
| `createdAt`, `updatedAt` | date | server | |

Client-sent values for any server-set field are dropped by the zod schemas (tested).

## Vocabularies

| Field | Values |
|---|---|
| `type` | `web_application`, `api`, `server`, `database`, `container`, `repository`, `cloud_resource`, `mobile_application`, `network_device`, `other` |
| `environment` | `production`, `staging`, `development`, `test`, `other` |
| `criticality` | `critical` (4), `high` (3), `medium` (2), `low` (1) |
| `exposure` | `internet_facing`, `internal`, `unknown` |
| `status` | `planned`, `active`, `deprecated`, `retired` |
| `identifiers.kind` | `url`, `hostname`, `ip_address`, `repository`, `cloud_resource_id`, `container_image`, `package`, `other` |
| `discovery.source` | `manual` (only value today), `import`, `scanner`, `integration` |

The plan's list of types was extended with `network_device` and `other`. The `other` entries keep the
controlled vocabularies closed without blocking unusual assets.

## Lifecycle

Two independent dimensions:

1. **`status`:** where the real system is in its life.

   ```
   planned ──► active ──► deprecated ──► retired
      │           ▲            │            │
      └──► retired└────────────┘            │
                  ▲                          │
                  └──────── (recommission) ──┘
   ```
   Allowed: planned→active|retired, active→deprecated|retired, deprecated→active|retired, retired→active.
   New assets start as `planned` or `active`. Other transitions are a `400` on `status`.

2. **`archived`:** whether the record is part of the live inventory.
   - **Archive** (owner/admin): hidden from the default listing, read-only, identifiers freed.
   - **Restore:** back to live; fails with `409 ASSET_IDENTIFIER_EXISTS` if another live asset took
     one of its identifiers meanwhile.
   - **Delete:** permanent, archived assets only (`409 ASSET_NOT_ARCHIVED` otherwise). The asset's
     software components are deleted with it, in the same transaction; the audit entry records how
     many (`metadata.count`). The audit log keeps the record that the asset existed.

A retired asset is still a record of something that existed. Archiving is the inventory hygiene
action.

## Identifiers

Identifiers are how later phases (imports, scanners, integrations) recognise that a discovered
system is an asset already in the inventory. They are therefore **typed** and **normalized**
(`server/src/utils/assetIdentifiers.js`):

| Kind | Validation | Normalized form |
|---|---|---|
| `url` | `http:`/`https:` only (no `javascript:`, `data:`, `file:`…), no embedded credentials | scheme + lower-case host (default port dropped) + path without trailing slash; query and fragment ignored |
| `hostname` | RFC-style labels; IP literals redirected to `ip_address` | lower-case, trailing dot removed |
| `ip_address` | IPv4/IPv6 via `node:net`, optional CIDR prefix within range | IPv6 lower-cased |
| `repository` | https/ssh/git URL, `git@host:owner/repo`, or `host/owner/repo`; ≥ 2 path segments | `host/owner/repo`, lower-case, no `.git` |
| `container_image` | image reference characters only | lower-case |
| `cloud_resource_id`, `package`, `other` | non-empty, no control characters | unchanged (these IDs can be case-sensitive) |

**Uniqueness:** a partial unique index on `(organizationId, identifierKeys)` for `archived: false`.
- The same identifier can't belong to two live assets in one organization (checked first for a
  per-row error, enforced by the index under concurrency).
- It is allowed in different organizations.
- An archived asset doesn't block reuse.
- Duplicates within one asset are rejected.

Nothing about identifiers triggers network activity. They are records, not scan targets, and the UI
renders them as text, never as links.

## Indexes

| Index | Purpose |
|---|---|
| `{ organizationId, archived, name }` (collation en/2) | default listing, case-insensitive name sort |
| `{ organizationId, archived, criticalityRank: -1, name }` | criticality sort |
| `{ organizationId, archived, updatedAt: -1 }`, `{ …, createdAt: -1 }` | recency sorts |
| `{ organizationId, tags }` | tag filter |
| `{ organizationId, type, environment }` | type/environment filters |
| unique partial `{ organizationId, identifierKeys }` (live, non-empty) | identifier uniqueness |
| unique partial `{ organizationId, discovery.source, discovery.externalId }` (string externalId) | reserved: one record per external ID per source |

`auditlogs` gained `{ organizationId, resourceType, resourceId, createdAt }` for per-asset history.

## Concurrency

- **Edits:** `PATCH` must include the `revision` the client read. The update is a single
  `findOneAndUpdate` conditioned on that revision and `archived: false`, so concurrent edits
  can't silently overwrite each other (tested: two same-revision edits → one 200, one 409). The UI
  offers "Reload latest version".
- **Identifier races:** resolved by the unique index (tested: 3 parallel creates → 201, 409, 409).

## Limits

| Limit | Value |
|---|---|
| Assets per organization (archived included) | 10,000 (`409 ASSET_LIMIT_REACHED`) |
| Asset writes per organization | 600 per hour (`429`) |
| Page size | default 25, max 100 |
| Search text | 100 characters |

## Future phases

| Phase | Hook already in place |
|---|---|
| Software inventory | **Implemented** (`docs/software/`): components reference `assetId` (+ `organizationId`), archive state is mirrored to them and delete cascades. `technologies` stays as display labels |
| Vulnerability matching | **Implemented** (`docs/matching/`): matches reference the asset and its components, follow archive state, and are deleted in the asset-delete transaction. |
| Findings | Findings will reference an asset, a component and a match. Delete already cascades to software and matches — any further referencing collection must be added to that transaction. |
| Risk prioritization | `criticality`/`criticalityRank`, `environment` and `exposure` are the organizational context inputs (§32). No score is computed now. |
| Scanning / imports / integrations | `identifierKeys` for matching and de-duplication, `discovery.source/externalId/lastSeenAt`, and the unique external-ID index. Only explicitly authorized targets may be scanned (§36). |
| Audit log UI | Asset events are queryable by `resourceType: 'asset'` + `resourceId`. |
