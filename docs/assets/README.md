# Asset management

The organization-scoped inventory of everything an organization needs to protect (master plan
§5.1, §5.8, §26). It is the foundation later phases attach to: software inventory, vulnerability
matching, findings, remediation and scanning.

| Document | Contents |
|---|---|
| [asset-model.md](./asset-model.md) | Schema, vocabularies, lifecycle, identifiers, indexes, future-phase hooks |
| [api.md](./api.md) | Endpoint contracts, query parameters, error codes |
| [security.md](./security.md) | Authorization, tenant isolation, validation, audit, tests, limitations |

UI rules: [../design-system/pages/assets.md](../design-system/pages/assets.md).

## What exists in this phase

- **Inventory:** asset records with type, environment, business criticality, internet exposure,
  lifecycle status, typed identifiers, tags, technology labels, owning team and contact, and
  server-controlled provenance.
- **Actions:** create, read, edit (with optimistic concurrency), archive, restore, and permanent
  delete of archived assets (which also removes their software components).
- **Software:** each asset's dependency inventory lives in its own collection and is documented in
  [../software/](../software/README.md); the asset detail page carries a Software panel.
- **Listing:** server-side search, filters, sort and pagination, plus inventory counts.
- **Controls:** tenant isolation, RBAC through the existing Phase 3 permission catalogue, and an
  audit event for every change.
- **UI:**
  - inventory, detail, and create/edit screens inside the organization shell
  - empty, loading, error and success states
  - responsive layouts and reduced motion

## Not in this phase

No CVE/NVD/OSV data, matching, findings, risk scores, remediation, scanning, background jobs,
notifications, analytics or AI. The model reserves the hooks those phases need (see
[asset-model.md → Future phases](./asset-model.md#future-phases)) without implementing them.

## Architecture

```
routes/assetRoutes.js        requireAuth → requireMembership(:organizationId | "current")
                             → requirePermission(assets:*) → validateBody / validateQuery
controllers/assetController.js   HTTP only
services/assetService.js     identifier normalization + uniqueness, contact membership,
                             lifecycle transitions, archive state, revisions, audit, serialization
config/assets.js             vocabularies, transitions, limits (mirrored in client/src/features/assets/assetCatalog.js)
utils/assetIdentifiers.js    per-kind identifier validation and normalization
validators/assetValidators.js   zod body and query schemas
models/Asset.js              schema + indexes
```

No new middleware, permissions, error format or audit mechanism: assets reuse the Phase 3
authorization chain, the central permission map, the structured error shape and `AuditLog` (which
gained a generic `resourceType`/`resourceId` reference for this and later domains).

```
client/src/features/assets/
  pages/AssetInventoryPage.jsx   /organization/assets            (URL-driven search/filter/sort/page)
  pages/AssetDetailPage.jsx      /organization/assets/:assetId
  pages/AssetFormPage.jsx        /organization/assets/new, /:assetId/edit
  components/                    InventoryToolbar, AssetResults (+Pagination), AssetSignals, ChipInput
  assetCatalog.js, inventoryQuery.js, useFlash.js
client/src/services/assets/      assetApi.js, assetErrors.js
```

Pages are lazy-loaded route chunks inside the existing `OrganizationLayout` (Assets is now the first
nav item and the organization landing page).
