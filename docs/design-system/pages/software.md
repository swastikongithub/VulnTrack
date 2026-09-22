# Page overrides — Software

Extends `../MASTER.md`, `organization.md` and `assets.md` for `/organization/software` and the
**Software** panel on `/organization/assets/:assetId`.

## Principles

- **A dependency list, not a package manager.** The page answers supply-chain questions: what do we
  run, where, and in how many versions. It never suggests it can install, update or scan anything.
- **Identity is shown, not implied.** Every row shows the package URL it was stored as, in mono.
  What the system will later match on is visible to the person entering it.
- **Unknown is a state, not a blank.** A component with no version is shown in a warning tone with a
  question-mark icon and counted in its own readout, because it is the thing that will silently fail
  to match later. It is never rendered as an empty cell.
- **No severity language.** Nothing here is colored by risk. The only warning tone in the phase
  marks unknown versions and multi-version packages — inventory-quality problems, not vulnerability
  findings. Severity colors stay unused until findings exist.
- **URL is the state.** Search, filters, sort and page live in the query string. Filter changes
  replace the history entry; page changes push one. (The asset panel keeps its search and page in
  component state instead — it is a section of another page, not a view of its own.)

## Signals

| Signal | Component | Treatment |
|---|---|---|
| Ecosystem | `EcosystemBadge` | Short mono abbreviation (`NPM`, `PYPI`, `MVN`…) in an instrument tile, the counterpart of `AssetTypeIcon`. Ion ring for registry ecosystems, neutral for other software. Decorative; the label is always in text nearby. |
| Version | `VersionText` | Mono code for a known version; warning text with a help icon plus a screen-reader "version" for unknown. |
| Usage | `usageText` | "Direct · Runtime", omitting parts not specified; "Not specified" when neither is. |
| Package URL | mono caption | Truncated with a `title`; prefixed for screen readers with the ecosystem label. |
| Archived asset | `ArchivedChip` | Reused from assets, next to the asset link. |

## Inventory page

```
PageHeader (eyebrow "<Org> · Supply chain", Add component if assets:update)
Readouts ×4: Components · Packages · Assets covered · Unknown versions
Toolbar: [search]  [Filters · n (<1024)]  [Sort]
Filters: ecosystem · dependency · scope · version
Panel "Components on live assets" (n results · sorted by …)  [Clear filters]
  ≥768: semantic <table> — Package · Version · Asset · Usage · Updated · actions
        (Usage and Updated appear by the table's own width; see Responsive)
  <768: stacked cards
  Pagination: "26–30 of 30 components" · Previous · Page 2 of 2 · Next
Side panel (≥1536): "Most used packages"
```

- **Two-column from 1536px** (`2xl`), single column below, so the table keeps its width on laptops.
- **Search** debounces at 300 ms (Enter applies immediately) and covers package name, vendor and
  purl; the clear button is 40px.
- **Filters:** always visible from 1024px, a disclosure below that; two columns from `xs`, four from
  `xl`.
- **Rows are not links.** Unlike assets, a component has no detail page — the row's actions are Edit
  and Remove icon buttons, and the *asset* name is the link.
- **Loading:** skeleton rows first. On later queries the previous page stays, dimmed (`aria-busy`),
  so results never flash empty. A visually hidden `role="status"` announces the result count.
- **Pagination focus:** paging moves focus to the panel heading.
- **Most used packages:** the 8 most widely deployed, each showing its asset count and version
  count; a package in more than one version shows that count in warning tone. Selecting one searches
  for it — the panel is a shortcut into the list, not a separate view.

Empty states:
- **Empty inventory:** eyebrow "No software recorded", "List what your assets run", copy explaining
  that exact versions are what advisories are written against, and a CTA only for roles that can
  edit (plus a link to the asset list).
- **No matches:** search-x icon + Clear filters.
- **Past the last page:** one line with a link back to the first page.

## Asset panel

On the asset detail page, between Identifiers and Classification:

```
Panel "Software" (eyebrow "Supply chain", "n components recorded")  [Add component]
  [search — only when there are more than 8 components, or a search is active]
  results (same table/cards, without the Asset column)
  pagination (50 per page)
```

- **Capability follows the asset:** the Add button and row actions use the asset's own
  `actions.update`, so an archived asset's software is visibly read-only, in one place, with no
  second rule to keep in step.
- **Archived assets still show their software here**, even though it is out of the organization-wide
  inventory — archiving shouldn't make a record vanish from the thing it describes.
- The Technologies field in the Classification panel now says it holds descriptive labels only, and
  points at this panel for versioned packages.

## Component dialogs

Add and edit share one dialog (`ComponentEditorDialog`):

- **Asset picker** only when opened without a fixed asset (from the inventory page); on the asset
  panel the asset is fixed and shown as context.
- **Fields:** ecosystem → name → version → vendor (other software only) → dependency → scope.
- **Ecosystem drives the form.** The name label, placeholder and hint change per ecosystem
  (`groupId:artifactId` for Maven, a module path for Go…), and the vendor field appears only for
  other software.
- **Version hint:** "Leave empty if unknown", with a warning line in the preview when it is empty.
- **Live package URL preview** under the fields: the identity that will be stored, updating as you
  type. This is the phase's one piece of teaching — it makes normalization visible instead of
  surprising (`Express` → `pkg:npm/express@4.18.2`).
- **Validation** runs through the same normalization rules as the server (a browser copy of the
  server utility), so per-ecosystem mistakes are caught before a request; server `fields` still map
  back onto the inputs.
- **Edits send only changed fields** plus `revision`; a stale revision reloads the list behind the
  dialog.
- Removal is a separate danger-tone dialog naming the package and version; focus starts on Cancel.
- Dialogs scroll internally (`max-h-[calc(100dvh-2rem)]`), so the form is usable at 360px and in
  landscape.

## Responsive and motion

- Verified at 360, 768, 1024, 1280, 1440 and 1920px with no horizontal overflow. Controls are ≥44px; long
  package names and purls wrap or truncate rather than widening the table.
- The table collapses to cards below 768px.
- **Optional columns follow the table's width, not the viewport's** (container queries on the
  results wrapper): Usage appears when the table is at least 42rem wide, Updated at 56rem. The same
  component sits in the full-width inventory and in the narrower left column of the two-column asset
  page, where viewport breakpoints starved the Package column. Package keeps ≥180px at every width
  (verified at 768, 1024, 1280, 1440 and 1920).
- The inventory grid declares an explicit `minmax(0,1fr)` column below 1536px; an implicit `auto`
  track sized to its content and pushed the toolbar off-screen at 360px.
- The parent-asset link in cards has a 44px hit area (vertical padding offset by negative margin).
- Under reduced motion, CSS transitions collapse, Framer content appears without movement, and
  nothing essential depends on animation.
