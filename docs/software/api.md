# Software API

Base path `/api`. Common rules follow [../authentication/api.md](../authentication/api.md):
- JSON bodies; `Origin` required on `POST`/`PATCH`/`DELETE`
- session cookie
- `Cache-Control: no-store`, `X-Request-Id`
- structured errors

`:organizationId` is an organization id **or `current`**, resolved to the caller's active membership
before any permission check. For non-members, unknown ids and malformed ids alike, the response is
`404 NOT_FOUND`.

| Method | Path | Permission |
|---|---|---|
| `GET` | `/organizations/:organizationId/software` | `assets:read` |
| `GET` | `/organizations/:organizationId/software/summary` | `assets:read` |
| `GET` | `/organizations/:organizationId/software/:componentId` | `assets:read` |
| `POST` | `/organizations/:organizationId/assets/:assetId/software` | `assets:update` |
| `PATCH` | `/organizations/:organizationId/software/:componentId` | `assets:update` |
| `DELETE` | `/organizations/:organizationId/software/:componentId` | `assets:update` |

A component is **created under its asset** (that is what gives it an owner) and addressed **by its
own id** afterwards, because editing and removal don't need the asset in the path and the
organization-wide UI works from component ids.

## Error codes (new)

| Code | Status | Meaning |
|---|---|---|
| `SOFTWARE_COMPONENT_EXISTS` | 409 | This asset already lists this package at this version; `fields.version` carries the message |
| `SOFTWARE_CONFLICT` | 409 | The `revision` sent is stale (someone else saved first) |
| `SOFTWARE_LIMIT_REACHED` | 409 | Per-asset or per-organization cap reached; `details.scope` is `asset` or `organization` |

Reused codes:
- `400 VALIDATION_FAILED`: `fields` keyed by input (`ecosystem`, `name`, `vendor`, `version`, …).
- `409 ASSET_ARCHIVED`: adding to, editing or removing software on an archived asset.
- `401`, `403 FORBIDDEN`, `404 NOT_FOUND`, `429 RATE_LIMITED`.

## Component representation

```json
{
  "id": "…",
  "asset": {
    "id": "…", "name": "Payments API",
    "type": "api", "typeLabel": "API",
    "criticality": "critical", "criticalityLabel": "Critical",
    "archived": false
  },
  "ecosystem": "npm", "ecosystemLabel": "npm",
  "name": "express",
  "vendor": null,
  "packageKey": "npm:express",
  "version": "4.18.2",
  "versionNormalized": "4.18.2",
  "purl": "pkg:npm/express@4.18.2",
  "relationship": "direct", "relationshipLabel": "Direct",
  "scope": "runtime", "scopeLabel": "Runtime",
  "source": "manual", "sourceLabel": "Manual entry",
  "createdAt": "…", "createdBy": { "id": "…", "fullName": "Anna Analyst" },
  "updatedAt": "…", "updatedBy": { "id": "…", "fullName": "Anna Analyst" },
  "revision": 2,
  "actions": { "update": true, "delete": true }
}
```

- **`version` vs `versionNormalized`:** the first is what was entered, the second is the canonical
  form for the ecosystem. Both are `null` when the version is unknown.
- **`packageKey`** is the package regardless of version (`ecosystem:normalized name`).
- **`actions`:** true when the caller has `assets:update` **and** the parent asset is not archived.
  They shape the UI only; the API re-checks.
- **People** are shown by name only (no emails), since every role can read software.

## `GET …/software`

| Parameter | Values | Default |
|---|---|---|
| `q` | text ≤ 100; case-insensitive literal match on name, package key, vendor and purl | — |
| `assetId` | a 24-hex asset id; restricts the list to that asset | — |
| `ecosystem`, `relationship`, `scope` | one value or a comma-separated list (`ecosystem=npm,pypi`) | — |
| `version` | `known` \| `unknown` | — |
| `sort` | `name`, `ecosystem`, `updatedAt`, `createdAt` | `name` |
| `order` | `asc` \| `desc` | `asc` for text fields, `desc` for dates |
| `page` | 1–10000 | 1 |
| `pageSize` | 1–100 | 25 |

→ `200 { components: [...], page, pageSize, total, totalPages, sort, order }`

- **Scope:** without `assetId`, only software on **live** assets is returned. With `assetId`, the
  asset's software is returned even if the asset is archived (after a 404 check on the asset, so a
  foreign or unknown asset id can't be probed).
- **Stable order:** ties break on the normalized version, then `_id`. Name sorting uses the
  collation index, so `Express` and `express` sort together. Reversing the name order does not
  reverse versions within a package — versions stay ascending, which is what a reader expects.
- **Invalid parameters:** `400` with `fields` keyed by parameter, including unknown enum values and
  out-of-range numbers. Unknown parameter *names* are ignored.
- **Past the last page:** returns `components: []` with the real `total`.

## `GET …/software/summary`

Counts over the live inventory (components of archived assets excluded, not affected by filters):

```json
{ "total": 42, "packages": 30, "assets": 6, "unknownVersions": 3,
  "multiVersionPackages": 2,
  "byEcosystem": { "npm": 20, "pypi": 8, "maven": 0, "nuget": 0, "go": 6,
                   "cargo": 0, "rubygems": 0, "packagist": 0, "generic": 8 },
  "topPackages": [
    { "packageKey": "npm:lodash", "ecosystem": "npm", "ecosystemLabel": "npm",
      "name": "lodash", "assets": 4, "versions": 2 }
  ] }
```

- `packages` counts distinct `componentKey`s; `total` counts records.
- `multiVersionPackages` is how many packages run in more than one version — the first thing worth
  acting on in a dependency inventory.
- `topPackages` returns the 8 most widely deployed packages (by asset count, then version count).

## `POST …/assets/:assetId/software`

```json
{ "ecosystem": "npm", "name": "express", "version": "4.18.2",
  "relationship": "direct", "scope": "runtime" }
```

- **Required:** `ecosystem`, `name`.
- **Defaults:** `version: null` (unknown), `relationship: "unknown"`, `scope: "unknown"`,
  `vendor: ""`.
- **`vendor`** is accepted only when `ecosystem` is `generic`; otherwise `400` on `vendor`.
- **Server-derived:** `componentKey`, `versionNormalized`, `purl`, `source`, `assetArchived`,
  provenance and `revision`. Sending them has no effect.
- **Response:** `201 { component }`.
- **Errors:** `400`, `403`, `404` (unknown or foreign asset), `409 ASSET_ARCHIVED`,
  `409 SOFTWARE_COMPONENT_EXISTS`, `409 SOFTWARE_LIMIT_REACHED`, `429`.

## `PATCH …/software/:componentId`

Any subset of `ecosystem`, `name`, `vendor`, `version`, `relationship`, `scope`, plus the required
`revision`.

- The asset can't be changed; move a component by removing it and adding it to the other asset.
- Sending `version: null` or `""` marks the version unknown.
- Changing `ecosystem` away from `generic` clears the vendor.
- **Response:** `200 { component }`.
- **No-op:** a body with only `revision` is a `400` (`fields.form`).
- **Errors:** `400`, `403`, `404`, `409 SOFTWARE_CONFLICT`, `409 ASSET_ARCHIVED`,
  `409 SOFTWARE_COMPONENT_EXISTS` (when the edit collides with another record on the same asset).

## `DELETE …/software/:componentId`

→ `200 { ok: true }`.
- `409 ASSET_ARCHIVED` if the parent asset is archived (restore it first).
- Deleting the **asset** deletes its components; see
  [../assets/api.md](../assets/api.md).
