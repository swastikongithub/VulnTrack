# Page overrides — Vulnerabilities

Extends `../MASTER.md`, `organization.md` and `software.md` for `/organization/vulnerabilities`
and `/organization/vulnerabilities/:source/:sourceId`.

## Principles

- **A reference library, not an alarm.** The catalogue is public intelligence shared by every
  organization. Nothing on these pages says or implies that *your* assets are affected: matching is
  a later phase, and the page header says so in plain words.
- **Provenance first.**
  - Every row starts with its source (`NVD` / `OSV`) and the source's own ID.
  - The detail page ends with where and when the record came from, with a link to it.
  - Freshness is stated ("Up to date as of 3 hours ago"), never implied: the catalogue is a synced
    copy, not a live feed.
- **Severity is a rating, not a verdict.**
  - The CVSS panel is titled "Technical severity" and says it isn't the organization's risk (master
    plan §5.4).
  - A label-only rating shows no number.
  - A v4 vector with no published score shows "Score not published by the source", never an
    invented score.
- **Show what the source said.**
  - Ranges appear exactly as published, as intervals ("≥ 4.0.0, < 4.17.21", "all versions ≤
    4.5.0"), with a note that they aren't checked against the inventory yet.
  - Descriptions are plain text.
- **URL is the state:** search, filters, sort and page live in the query string, like the asset
  and software inventories.

## Signals

| Signal | Component | Treatment |
|---|---|---|
| Severity | `SeverityBadge` | Pill: `sev-*` dot + label + score (mono, 1 decimal). **Always a text label**; `unknown` reads "Not rated" in neutral. First use of the reserved severity ramp. It is a *pill*, unlike the asset criticality *meter*, so the two never read alike. Never Ion. |
| Known exploited | `ExploitedChip` | Danger tone + flame icon, "Known exploited" (compact: "Exploited"). Danger, not the severity ramp: exploitation isn't a CVSS level. |
| Rejected / withdrawn | `StatusChip` | Warning chip (ban / undo icon). Active advisories carry no chip. |
| Source | `SourceTag` | Mono uppercase tag. NVD neutral, OSV Ion. Ion marks the source here, never severity. |
| Package | `EcosystemBadge` | Reused from software. Ecosystems outside the inventory's list show their source name ("DEBIA…"). |

## Catalogue page

```
PageHeader (eyebrow "Global catalogue · Intelligence", "Vulnerabilities", what it is + not matched yet)
Readouts ×4: Active advisories · Critical · High · Known exploited
Toolbar: [search: ID or keyword]  [Filters · n (<1024)]  [Sort]
Filters: severity · source · ecosystem · exploitation · status (active by default)
Panel "Advisories" (n results · sorted by …)  [Clear filters]
  ≥768: table — Advisory (source, ID, aliases, chips) · Severity · Summary (2 lines)
        · Affects (table ≥ 48rem) · Modified (table ≥ 56rem)
  <768: cards (ID + severity, 3-line summary, chips, affects)
  Pagination "1–25 of 1,204 advisories"
Side panel (≥1536): Sources: records, last run state, "Up to date as of …"
```

- **Rows link to the detail page** (stretched link over the row, as for assets). The ID turns Ion
  on hover.
- **Search placeholder** shows both uses: "CVE-2021-44228, lodash, deserialization…". The
  no-match state explains that IDs match exactly.
- **Empty catalogue:** eyebrow "Catalogue empty" and an explanation that an operator runs the
  ingestion worker, not an organization, with the command for operators. No CTA: there's nothing
  a member can do about it.
- **Loading and error:** skeleton rows; previous page kept dimmed (`aria-busy`) during later
  queries; error Alert with "Try again"; a visually hidden status announces result counts.

## Detail page

```
← Vulnerabilities
eyebrow "<Source> advisory · <source status>"   title: ID (mono)
[Severity lg] [Known exploited] [Rejected/Withdrawn]
summary
┌ main ─────────────────────────────┐ ┌ side (24rem from 1280px) ─────┐
│ Description (clamped at 12 lines  │ │ CVSS: each version, badge,     │
│   past 1,200 chars + Show more)   │ │   vector, assessor             │
│ Affected packages (OSV)           │ │ Known exploited (KEV)          │
│   badge · name · ecosystem · purl │ │ Weaknesses (CWE → mitre.org)   │
│   SemVer / Versions / Commits     │ │ Identifiers: aliases (→ search)│
│   "Fixed in …" (success tone)     │ │   Related records (list)       │
│   ▸ N listed affected versions    │ │ Provenance + "View on NVD/OSV" │
│ Affected products (NVD CPE)       │ └────────────────────────────────┘
│   table, 25 then "Show all N"     │
│ References, grouped by type       │
└───────────────────────────────────┘
```

- **External links** (references, CWE, source record) carry an ↗ icon, open in a new tab with
  `noopener noreferrer nofollow`, and announce "(opens in a new tab)". References show the host
  first, then the path.
- **Aliases** link into the catalogue search, never out. Related records are rows with their own
  severity.
- **Not found:** warning Alert "Advisory not found: may not have been synced yet".
- **Long lists:** affected versions sit behind a native `<details>` (44px summary); CPE entries
  show 25 before "Show all"; the CPE table scrolls horizontally inside its panel on narrow screens.

## Responsive and motion

- Verified at 360, 768 and desktop with no page-level horizontal overflow.
- Every grid declares `minmax(0,1fr)` tracks, a lesson from the software page. Long IDs and
  vectors `break-all`.
- **Controls:** 44px where touched. Inline reference, CWE and alias links get a 44px minimum
  height below `sm`.
- **Reduced motion:** transitions collapse; Stagger content appears without movement; the
  running-sync spinner only spins with `motion-safe`.
