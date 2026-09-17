# Page overrides — Assets

Extends `../MASTER.md` and `organization.md` for `/organization/assets`, `/organization/assets/:id`,
and `/organization/assets/new` / `…/:id/edit`.

## Principles

- **Attack surface, not a spreadsheet.** Each row leads with a type tile and identity (name +
  primary identifier in mono). Business signals come next (criticality meter, environment,
  exposure, lifecycle), with recency last.
- **Only real data.** Readouts are live counts from `/assets/summary`. Nothing is labelled "live"
  or animated to suggest telemetry.
- **URL is the state.** Search, filters, view (live/archived), sort and page live in the query
  string, so views can be shared, reloaded and navigated with back/forward. Filter changes replace
  the history entry; page changes push one.

## Signals

| Signal | Component | Treatment |
|---|---|---|
| Criticality | `CriticalityMeter` | Four rising bars filled to the rank, plus the label. Uses the `sev-*` ramp for recognition, but as a **meter**, never a pill, so it can't be mistaken for a future vulnerability-severity badge. |
| Lifecycle | `LifecycleChip` | Dot + label: planned = info, active = success, deprecated = warning, retired = neutral. |
| Exposure | `ExposureChip` / table text | Internet-facing gets a globe and Ion color; internal and unknown stay neutral text. |
| Archived | `ArchivedChip` | Warning chip with an archive icon; replaces the lifecycle chip. |
| Type | `AssetTypeIcon` | Lucide icon in an instrument tile (10 types). Decorative; the type label is always present. |
| Tags | `TagList` | Mono, small, hairline chips. |

## Inventory

```
PageHeader (eyebrow "<Org> · Attack surface", New asset if assets:create)
Readouts ×4: Live assets · Critical · Internet-facing · Archived
Toolbar: [Live n | Archived n]  [search]  [Filters · n (<1024)]  [Sort]
Filters: type · environment · criticality · exposure · lifecycle · tag
Panel "Live assets" (n results · sorted by …)  [Clear filters]
  ≥768: semantic <table> (exposure column from 1280)   <768: stacked cards
  Pagination: "26–30 of 30 assets" · Previous · Page 2 of 2 · Next
```

- **Search** debounces at 300 ms (Enter applies immediately); the clear button is 40px.
- **Filters:** always visible from 1024px, a disclosure below that; three columns up to 1792px, then six.
- **Row links:** the whole row or card is the link (stretched `::after`); name hover turns Ion.
- **Loading:** skeleton rows first. On later queries the previous page stays, dimmed (`aria-busy`), so
  results never flash empty.
- **Pagination focus:** paging moves focus to the panel heading.

Empty states:
- **Empty inventory:** eyebrow "Empty inventory", "Map your attack surface", the perimeter motif (decorative), and a CTA only for roles that can create.
- **No matches:** search-x icon + Clear filters.
- **Archived view empty:** one line of copy.

## Detail

- **Back link and header:** "Assets" (44px). The header shows the type tile, name, and a signal row (criticality, lifecycle or archived, exposure, environment).
- **Actions by capability:** Edit (primary) and Archive (secondary). Archived assets show a warning Alert with Restore and Delete permanently.
- **Panels:**
  - Context (description + facts)
  - Identifiers (mono text + copy button; never links)
  - Tags and technologies
  - Ownership
  - Provenance: source, first recorded, last observed ("Not observed by a scanner yet"), created/updated by, revision, id
- **Layout:** two columns from 1280px, stacked below.
- **Dialogs:**
  - Archive: explains read-only and freed identifiers.
  - Delete: danger tone, requires typing the exact name; the delete button stays disabled until it matches.
  - Both start focus on Cancel.
- **Success messages:** one-shot Alerts carried in router state (created, updated, archived, restored, deleted) and cleared after display, so a reload doesn't repeat them.

## Create / edit

Numbered panels: 01 Identity · 02 Security context · 03 Identifiers · 04 Classification · 05 Ownership.

- **Criticality:** four radio cards (native radios, visually hidden) showing the meter, label and guidance.
- **Lifecycle select:** offers only valid next states when editing, and `planned`/`active` when creating.
- **Identifier rows:** type select + mono value input + remove button (44px). Adding a row focuses its input. Rows animate in and out.
- **Tags and technologies:** `ChipInput`. Enter or comma adds; Backspace removes the last chip; remove buttons have 44px hit areas; clicking anywhere in the well focuses the input.
- **Contact:** a select of current members, shown only when the role has `members:read`; otherwise an explanation.
- **Validation:**
  - Client checks for required fields.
  - Server `fields` map to inputs, including `identifiers.N.value` rows; element ids equal field keys so the ErrorSummary links work.
  - Two or more errors focus the summary; one error focuses its field.
- **Edit conflicts:** sending a stale `revision` shows "This asset changed" with "Reload latest version" (which discards the form's edits).
- **Payload:** edits send only changed fields plus `revision`.

## Responsive and motion

- Verified at 360, 375 and 768px with no horizontal overflow. Controls are ≥44px; row links stretch over the whole row.
- Under reduced motion, CSS transitions collapse, Framer content appears without movement, and nothing essential depends on animation.
