# Software / dependency inventory

What each asset actually runs: registry packages (npm, PyPI, Maven…) and other software identified
by vendor and product (master plan §5.9, §27). It sits between asset management and the phases that
will consume it:

```
Asset  ──►  Software component  ──►  (later) vulnerability matching  ──►  Finding
```

| Document | Contents |
|---|---|
| [software-model.md](./software-model.md) | Schema, ecosystems, canonical identity, versions, indexes, limits, future-phase hooks |
| [api.md](./api.md) | Endpoint contracts, query parameters, error codes |
| [security.md](./security.md) | Authorization, tenant isolation, validation, audit, tests, limitations |

UI rules: [../design-system/pages/software.md](../design-system/pages/software.md).

## What exists in this phase

- **Component records:** ecosystem, package name (and vendor for non-registry software), version,
  how it reaches the asset (direct/transitive) and where it is used (runtime/development), with
  server-controlled provenance.
- **Canonical identity:** every record carries a normalized `componentKey`, a normalized version and
  a Package URL, derived on the server. These are the fields matching will key on later.
- **Actions:** add a component to an asset, edit it (with optimistic concurrency) and remove it.
- **Listing:** organization-wide search, filters, sort and pagination, plus inventory counts and the
  most widely used packages.
- **Asset relationship:** components belong to one asset; archiving an asset makes its software
  read-only, and deleting an asset removes its components.
- **Controls:** tenant isolation, RBAC through the existing Phase 3 permission catalogue, and an
  audit event for every change.
- **UI:**
  - an organization-wide Software page and a Software panel on each asset
  - empty, loading, error and success states
  - responsive layouts and reduced motion

## Not in this phase

No CVE/NVD/OSV ingestion, version-range matching, findings, risk scores, remediation, scanning,
manifest/SBOM import, background jobs, notifications, analytics or AI. The model records the
identity those phases need (see
[software-model.md → Future phases](./software-model.md#future-phases)) without implementing them,
and without deciding the vulnerability model or the matching algorithm.

## Architecture

```
routes/softwareRoutes.js        requireAuth → requireMembership(:organizationId | "current")
                                → requirePermission(assets:read | assets:update)
                                → validateBody / validateQuery
controllers/softwareController.js   HTTP only
services/softwareService.js     identity derivation, duplicate and limit checks, parent-asset
                                state, revisions, audit, serialization, listing and summary
config/software.js              ecosystems, vocabularies, limits (mirrored in
                                client/src/features/software/softwareCatalog.js)
utils/softwareIdentity.js       per-ecosystem name/version validation, normalization, purl
validators/softwareValidators.js   zod body and query schemas
models/SoftwareComponent.js     schema + indexes
```

No new middleware, permissions, error format or audit mechanism: software reuses the Phase 3
authorization chain, the central permission map, the structured error shape and `AuditLog`.

```
client/src/features/software/
  pages/SoftwareInventoryPage.jsx   /organization/software    (URL-driven search/filter/sort/page)
  components/AssetSoftwarePanel.jsx  the Software panel on /organization/assets/:assetId
  components/                        SoftwareToolbar (+SearchBox), SoftwareResults, SoftwareSignals,
                                     ComponentDialogs (editor + remove)
  softwareCatalog.js, softwareQuery.js, componentIdentity.js
client/src/services/software/        softwareApi.js, softwareErrors.js
```

The inventory page is a lazy-loaded route chunk inside the existing `OrganizationLayout` (Software
is the nav item after Assets). The asset panel ships in the asset detail chunk.

## Asset coupling

| Asset event | Effect on its software |
|---|---|
| Archive | Components are flagged `assetArchived` and become read-only; they drop out of the organization-wide inventory but stay visible on the asset |
| Restore | The flag clears; components return to the inventory |
| Delete | Components are deleted in the same transaction; the audit entry records how many |

This resolves the Phase 4 limitation that "delete doesn't yet check references".
