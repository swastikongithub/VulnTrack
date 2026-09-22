# Asset API

Base path `/api`. Common rules follow [../authentication/api.md](../authentication/api.md):
- JSON bodies; `Origin` required on `POST`/`PATCH`/`DELETE`
- session cookie
- `Cache-Control: no-store`, `X-Request-Id`
- structured errors

`:organizationId` is an organization id **or `current`**. It is resolved to the caller's active
membership before any permission check. For non-members, unknown ids and malformed ids alike, the
response is `404 NOT_FOUND`.

| Method | Path | Permission |
|---|---|---|
| `GET` | `/organizations/:organizationId/assets` | `assets:read` |
| `GET` | `/organizations/:organizationId/assets/summary` | `assets:read` |
| `POST` | `/organizations/:organizationId/assets` | `assets:create` |
| `GET` | `/organizations/:organizationId/assets/:assetId` | `assets:read` |
| `PATCH` | `/organizations/:organizationId/assets/:assetId` | `assets:update` |
| `POST` | `/organizations/:organizationId/assets/:assetId/archive` | `assets:delete` |
| `POST` | `/organizations/:organizationId/assets/:assetId/restore` | `assets:delete` |
| `DELETE` | `/organizations/:organizationId/assets/:assetId` | `assets:delete` |

The master plan's `/assets` contract is nested under the organization because every asset is tenant-owned.

## Error codes (new)

| Code | Status | Meaning |
|---|---|---|
| `ASSET_IDENTIFIER_EXISTS` | 409 | Another live asset in this organization uses an identifier; `fields` points at the rows (`identifiers.N.value`) when known |
| `ASSET_CONFLICT` | 409 | The `revision` sent is stale (someone else saved first) |
| `ASSET_ARCHIVED` | 409 | Edit or archive attempted on an archived asset |
| `ASSET_NOT_ARCHIVED` | 409 | Restore or delete attempted on a live asset |
| `ASSET_LIMIT_REACHED` | 409 | Organization asset cap reached |

Reused codes:
- `400 VALIDATION_FAILED`: `fields` keys use dotted paths, e.g. `identifiers.1.value`, `owner.contactUserId`, `tags.0`.
- `401`, `403 FORBIDDEN`, `404 NOT_FOUND`, `429 RATE_LIMITED`.

## Asset representation

```json
{
  "id": "…",
  "name": "Payments API",
  "description": "Public REST API handling card authorisations.",
  "type": "api", "typeLabel": "API",
  "environment": "production", "environmentLabel": "Production",
  "criticality": "critical", "criticalityLabel": "Critical",
  "exposure": "internet_facing", "exposureLabel": "Internet-facing",
  "status": "active", "statusLabel": "Active",
  "identifiers": [{ "kind": "url", "kindLabel": "URL", "value": "https://pay.northwind.dev" }],
  "tags": ["payments", "pci"],
  "technologies": ["Go", "PostgreSQL"],
  "owner": { "team": "Payments", "contact": { "userId": "…", "fullName": "Anna Analyst" }, "contactRemoved": false },
  "discovery": { "source": "manual", "sourceLabel": "Manual entry", "firstSeenAt": "…", "lastSeenAt": null },
  "archived": false, "archivedAt": null, "archivedBy": null,
  "createdAt": "…", "createdBy": { "id": "…", "fullName": "Olivia Owner" },
  "updatedAt": "…", "updatedBy": { "id": "…", "fullName": "Olivia Owner" },
  "revision": 3,
  "actions": { "update": true, "archive": true, "restore": false, "delete": false }
}
```

- **`owner.contact`:** set only while the contact is an active member. Otherwise it is `null`, with `contactRemoved: true`.
  People are shown by name only (no emails), since every role can read assets.
- **`actions`:** the caller's capabilities for this asset. They shape the UI only; the API re-checks.
- **Identifiers:** the `normalized` form isn't returned.

## `GET …/assets`

| Parameter | Values | Default |
|---|---|---|
| `q` | text ≤ 100; case-insensitive literal match on name, identifier values, tags, technologies, owner team | — |
| `type`, `environment`, `criticality`, `exposure`, `status` | one value or a comma-separated list (`type=api,server`) | — |
| `tag` | a single tag | — |
| `archived` | `false` (live inventory) \| `true` (archived) | `false` |
| `sort` | `name`, `criticality`, `type`, `environment`, `status`, `createdAt`, `updatedAt` | `name` |
| `order` | `asc` \| `desc` | `asc` for text fields; `desc` for `criticality` and dates |
| `page` | 1–10000 | 1 |
| `pageSize` | 1–100 | 25 |

→ `200 { assets: [...], page, pageSize, total, totalPages, sort, order }`

- **Stable order:** ties break on `name`, then `_id`.
- **Invalid parameters:** `400` with `fields` keyed by parameter. This includes unknown enum values,
  a repeated key such as `type=a&type=b`, and out-of-range numbers. Unknown parameter *names* are ignored.
- **Past the last page:** returns `assets: []` with the real `total`.

## `GET …/assets/summary`

Counts over the live inventory (not affected by filters):

```json
{ "total": 30, "archived": 1, "internetFacing": 10,
  "byCriticality": { "critical": 8, "high": 7, "medium": 8, "low": 7 },
  "byEnvironment": { "production": 11, "staging": 7, "development": 6, "test": 6, "other": 0 },
  "tags": [{ "tag": "fleet", "count": 26 }, { "tag": "pci", "count": 2 }] }
```
`tags` returns the top 50, for the tag filter.

## `POST …/assets`

```json
{ "name": "Payments API", "type": "api", "environment": "production", "criticality": "critical",
  "exposure": "internet_facing", "status": "active", "description": "…",
  "identifiers": [{ "kind": "url", "value": "https://pay.northwind.dev" }],
  "tags": ["pci"], "technologies": ["Go"], "owner": { "team": "Payments", "contactUserId": "…" } }
```

- **Required:** `name`, `type`, `environment`, `criticality`.
- **Defaults:** `exposure: unknown`, `status: active` (`planned` also allowed), empty lists.
- **Response:** `201 { asset }`.
- **Errors:** `400`, `403`, `409 ASSET_IDENTIFIER_EXISTS`, `409 ASSET_LIMIT_REACHED`, `429`.

## `PATCH …/assets/:assetId`

Any subset of the create fields, plus the required `revision`.
- `owner.team` and `owner.contactUserId` can be updated independently; send `contactUserId: null` to clear it.
- **Response:** `200 { asset }`.
- **No-op:** unchanged values return the asset without a new revision.
- **Errors:**
  - `400`: including a disallowed `status` transition, or no fields besides `revision`
  - `403`
  - `404`
  - `409 ASSET_CONFLICT`, `ASSET_ARCHIVED`, `ASSET_IDENTIFIER_EXISTS`

## `POST …/archive`, `POST …/restore`

Body `{}` or `{ "revision": n }` (a stale revision gets `409 ASSET_CONFLICT`). → `200 { asset }`.
- **Archive errors:** `409 ASSET_ARCHIVED`.
- **Restore errors:** `409 ASSET_NOT_ARCHIVED` or `ASSET_IDENTIFIER_EXISTS`.

## `DELETE …/assets/:assetId`

→ `200 { ok: true }`.
- Archived assets only; a live asset gets `409 ASSET_NOT_ARCHIVED`.
- The asset's software components are deleted in the same transaction
  (see [../software/api.md](../software/api.md)).
