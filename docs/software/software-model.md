# Software component model

Collection: `softwarecomponents` (`server/src/models/SoftwareComponent.js`). Ecosystems,
vocabularies and limits: `server/src/config/software.js`. Identity rules:
`server/src/utils/softwareIdentity.js`.

## Why a separate collection

Components could have been an array on the asset. They are their own collection because:

- an asset can run hundreds of components, each added, edited and removed on its own;
- organization-wide questions ("which assets run `lodash`, and in which versions?") need an index
  **across** assets, which an embedded array can't provide efficiently;
- findings will later reference a specific component by `_id`.

Components are tenant-owned exactly like assets: every query filters `organizationId`, and every
index starts with it.

## Fields

| Field | Type | Set by | Notes |
|---|---|---|---|
| `organizationId` | ObjectId | server (from membership) | Tenant boundary; never read from the request |
| `assetId` | ObjectId | server (from the URL) | The asset that runs this software; fixed after creation |
| `assetArchived` | boolean | server | Mirrors the parent asset's `archived`, kept in step by the asset service |
| `ecosystem` | enum | client | Which packaging world the name belongs to |
| `name` | string ≤ 214 | client | **As entered**, for display; trimmed, control characters rejected |
| `vendor` | string ≤ 100 \| null | client | Other software only; rejected for registry ecosystems |
| `componentKey` | string | server | `ecosystem:normalized name` — the package regardless of version |
| `version` | string ≤ 64 \| null | client | **As entered**; `null` means *unknown*, never "latest" |
| `versionNormalized` | string ≤ 64 \| null | server | Normalized for the ecosystem's scheme; what matching will compare |
| `purl` | string ≤ 512 | server | Package URL, derived from ecosystem + name + version |
| `relationship` | enum, default `unknown` | client | `direct`, `transitive` |
| `scope` | enum, default `unknown` | client | `runtime`, `development` |
| `source` | enum, `manual` | server | `import` and `scanner` are reserved |
| `createdBy`, `updatedBy` | ObjectId | server | |
| `revision` | integer | server | Incremented by every write; updates must present it |
| `createdAt`, `updatedAt` | date | server | |

Both the entered and the normalized forms are kept. The entered form is what a person recognises;
the normalized form is what machines will join on. Client-sent values for any server-set field are
dropped by the zod schemas (tested).

## Ecosystems

Values follow the naming used by the **OSV schema** and the **Package URL (purl) spec**, because
those are what public vulnerability sources key affected packages by. Choosing them now means a
later matching phase doesn't have to re-map an invented vocabulary.

| `ecosystem` | Label | purl type | Version scheme | Name shape |
|---|---|---|---|---|
| `npm` | npm | `npm` | semver | `express`, `@scope/name` |
| `pypi` | PyPI | `pypi` | pep440 | `django` |
| `maven` | Maven | `maven` | maven | `groupId:artifactId` |
| `nuget` | NuGet | `nuget` | nuget | `Newtonsoft.Json` |
| `go` | Go | `golang` | go | `github.com/gin-gonic/gin` (or `stdlib`) |
| `cargo` | crates.io | `cargo` | semver | `serde` |
| `rubygems` | RubyGems | `gem` | rubygems | `rails` |
| `packagist` | Packagist | `composer` | composer | `vendor/package` |
| `generic` | Other software | `generic` | generic | vendor + product (`F5` + `nginx`) |

`generic` covers software that isn't a registry package — nginx, PostgreSQL, an operating system.
It is identified by **vendor + product**, which is the shape CPE-style matching needs later.
`vendor` is accepted only for this ecosystem; sending it with a registry ecosystem is a `400`, and
changing a component's ecosystem away from `generic` drops the vendor.

## Canonical identity

Three derived fields, all computed on the server and never accepted from a client:

```
componentKey       npm:@nestjs/core          the package, any version
versionNormalized  4.18.2                    the version, in the ecosystem's normal form
purl               pkg:npm/%40nestjs/core@4.18.2
```

### Name normalization

Only differences the ecosystem itself treats as irrelevant are removed:

| Ecosystem | Normalization |
|---|---|
| npm | lower-cased |
| PyPI | PEP 503: lower-cased, runs of `-`, `_`, `.` collapse to `-` |
| Maven | unchanged (`groupId:artifactId` is case-sensitive) |
| NuGet | lower-cased (package IDs are case-insensitive) |
| Go | module path with the host lower-cased; `stdlib` accepted as-is |
| crates.io | lower-cased, `_` → `-` |
| RubyGems | unchanged (gem names are case-sensitive) |
| Packagist | lower-cased `vendor/package` |
| Other software | vendor and product lower-cased, whitespace collapsed, joined `vendor/product` |

A name that doesn't fit its ecosystem's rules is **rejected with a field message** rather than
coerced. `bad name` is not an npm package; `log4j-core` without a group is not a Maven coordinate.

### Version normalization

| Scheme | Rule |
|---|---|
| `semver` (npm, cargo) | strict SemVer; a leading `v` or `=` is stripped |
| `go` | SemVer, stored **with** the `v` prefix Go module versions carry |
| `pep440` | PEP 440 public/local version, lower-cased, leading `v` stripped |
| `nuget` | version token, lower-cased |
| `composer` | version token, lower-cased, leading `v` stripped |
| `maven`, `rubygems`, `generic` | version token, unchanged |

A version token is `[A-Za-z0-9][A-Za-z0-9._+~:-]*`.

**Unknown is a first-class value.** An empty version stores `null` for both `version` and
`versionNormalized`, and the purl is built without a version. The UI shows "Version unknown" in a
warning tone and counts these separately, because a component with no version can't be matched
against an affected range later. Words like `latest` are rejected: they are not versions.

**Nothing here compares versions.** Ordering, ranges and "is this affected" belong to the matching
phase, which will read each ecosystem's `scheme` from `config/software.js` and pick the right
comparator. Locking that in now would prematurely fix the matching algorithm.

## Uniqueness

A unique index on `(organizationId, assetId, componentKey, versionNormalized)`:

- one record per package **version** per asset;
- several versions of the same package on one asset are allowed (that's a real and interesting
  situation, surfaced on the inventory page);
- the same package on different assets is allowed, and is the point of the organization-wide view;
- `null` (unknown version) participates like any other value, so an asset can hold at most one
  version-less record per package.

A duplicate is checked first for a per-field error, and enforced by the index under concurrency —
the `11000` duplicate-key error maps to the same `409 SOFTWARE_COMPONENT_EXISTS` (tested with
parallel creates).

## Parent asset coupling

`assetArchived` denormalizes the asset's archive flag so live-inventory queries stay on one
collection instead of joining `assets` on every list.

- **Archive / restore** updates the asset and its components in one transaction.
- **Delete** removes the asset and its components in one transaction; the `asset.delete` audit
  entry records `metadata.count`.
- While an asset is archived, its components are **read-only**: `actions.update`/`actions.delete`
  are false, and the API rejects writes with `409 ASSET_ARCHIVED`.
- The organization-wide list excludes archived assets' software; the asset's own panel still shows
  it, so archiving never silently hides a record from the place it belongs to.

## Indexes

| Index | Purpose |
|---|---|
| unique `{ organizationId, assetId, componentKey, versionNormalized }` | uniqueness; its prefix also serves an asset's own software list |
| `{ organizationId, assetArchived, componentKey, versionNormalized }` | "where is this package used", and the future matching join |
| `{ organizationId, assetArchived, name }` (collation en/2) | default listing, case-insensitive name sort |
| `{ organizationId, assetArchived, ecosystem }` | ecosystem filter and grouping |
| `{ organizationId, assetArchived, updatedAt: -1 }`, `{ …, createdAt: -1 }` | recency sorts |

## Concurrency

`PATCH` must include the `revision` the client read. The update is a single `findOneAndUpdate`
conditioned on that revision, so concurrent edits can't silently overwrite each other (tested: two
same-revision edits → one 200, one `409 SOFTWARE_CONFLICT`). The UI offers to reload.

## Limits

| Limit | Value |
|---|---|
| Components per asset | 1,000 (`409 SOFTWARE_LIMIT_REACHED`, `details.scope: "asset"`) |
| Components per organization | 50,000 (`details.scope: "organization"`) |
| Software writes per organization | 1,200 per hour (`429`) |
| Page size | default 25, max 100 |
| Name / vendor / version | 214 / 100 / 64 characters |
| Search text | 100 characters |

The write limit is higher than the asset one (600/h) because adding a dependency list is naturally
many small writes.

## Future phases

| Phase | Hook already in place |
|---|---|
| Manifest / SBOM import | `source` reserves `import`; identity normalization is already the shape a `package-lock.json` or SBOM parser would produce |
| Dependency scanning | `source` reserves `scanner`; components are per-asset records a scan can reconcile against |
| Vulnerability intelligence | `componentKey` and `purl` are the identities OSV and purl-based advisories use; `ecosystem` maps 1:1 to OSV ecosystems |
| Vulnerability matching | `versionNormalized` + the ecosystem's `scheme` give a comparator its inputs. **No range semantics, comparator or vulnerability schema is fixed by this phase.** |
| Findings | A finding will reference `assetId` **and** the component `_id`; components already carry both, plus `organizationId` |
| Risk prioritization | The asset's `criticality`, `environment` and `exposure` supply organizational context; `scope: development` is the signal that a component is less exposed |
| Audit log UI | Component events are queryable by `resourceType: 'software_component'` + `resourceId`, with `metadata.assetId` |
