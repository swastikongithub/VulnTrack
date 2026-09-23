# Page overrides — Matches

Extends `../MASTER.md`, `organization.md`, `software.md` and `vulnerabilities.md` for
`/organization/matches`, `/organization/matches/:matchId`, and the **Exposure** panels on the asset
and advisory pages.

## Principles

- **Potential, not proven.** Every surface says *potential match*. There is no status workflow,
  owner or due date, because a match is not a finding — the next phase adds those, and pretending
  otherwise here would teach the wrong model.
- **Show the working.** A match always carries the rule, the version scheme and the bounds that
  produced it, in a sentence and in structured fields. Someone must be able to disagree with a
  specific step rather than with "the tool".
- **Two meanings, two vocabularies.**
  - *Severity* belongs to the advisory: the reserved `sev-*` ramp, as on the catalogue pages.
  - *Status* and *confidence* belong to this conclusion: danger/warning/neutral chips and a
    three-bar confidence meter. The severity ramp is never used for match status.
- **Undecidable is a result.** `Version unknown` and `Undetermined` are first-class rows with their
  own filters, never hidden and never rounded to "affected" or "safe". The unknown-version case
  links back to the component so it can be fixed.
- **Freshness is stated.** Matching runs on demand, so the page says when it last ran and how many
  components were checked. Nothing implies live monitoring.

## Signals

| Signal | Component | Treatment |
|---|---|---|
| Match status | `MatchStatusChip` | `Affected` danger + shield, `Version unknown` warning + question mark, `Undetermined` neutral. |
| Confidence | `ConfidenceChip` | Three bars filled to the level plus the word: "High confidence". Neutral tones — it qualifies, it doesn't alarm. |
| Fix | `FixedIn` | Success tone, "Fixed in 4.17.21" — the most actionable fact a match carries. |
| Severity | `SeverityBadge` (reused) | The advisory's rating, unchanged from the catalogue. |
| Source / ecosystem | `SourceTag`, `EcosystemBadge` (reused) | Same marks as Phases 5–6, so the same things look the same. |

## Matches page

```
PageHeader (eyebrow "<Org> · Exposure", "Matches", [Recalculate] if findings:create)
Readouts ×4: Affected · Assets affected · Known exploited · Needs a version
"Last matched 5 minutes ago · 120 components in the live inventory"
Toolbar: [search] [Filters · n (<1024)] [Sort]
Filters: match status · severity · confidence · ecosystem · exploitation · live/archived assets
Panel "Potential matches" (n results · sorted by …) [Clear filters]
  ≥768: table — Advisory · Severity · Component · Asset (≥48rem) · Match
  <768: cards
  Pagination "1–25 of 42 matches"
```

- **Rows link to the match**, not to the advisory: the decision is the thing being reviewed. The
  asset name is a separate link, above the row link in the stacking order.
- **Recalculate** is a normal button that waits for the run and reports what changed ("120
  components checked · 4 new matches, 1 no longer applies"). A run already in progress is reported
  as such, not as an error.
- **Empty states** distinguish *never run* from *nothing matched*: the first explains what matching
  does, the second says every component was checked and none applied. Neither invents a CTA for
  roles that can't recalculate.

## Match detail

```
← Matches
eyebrow "Potential match"   title: advisory ID (mono)
[Severity lg] [Match status] [Confidence]
summary
┌ main ───────────────────────────────┐ ┌ side (22rem from 1280px) ──┐
│ Why this matched                    │ │ Component (+ asset, dates) │
│   sentence + installed version,     │ │ Source record (advisory,   │
│   matched on, rule, version scheme  │ │   CVEs, CWEs, dates)       │
│   Fixed in …                        │ └────────────────────────────┘
│   [warning + link if version unknown]│
│ What the advisory published         │
│   ranges as published, per package  │
└─────────────────────────────────────┘
```

The "Why this matched" panel is the point of the page: the plain sentence first, then the exact
inputs. "What the advisory published" repeats the source ranges unevaluated, so the reader can
check the engine rather than trust it.

## Embedded panels

One component (`MatchesPanel`) serves both, so rows look identical everywhere:

- **Asset page**, after Software: "Potential matches" for that asset. Archived assets include their
  archived matches, matching how the software panel behaves.
- **Advisory page**, before References: "In your inventory" — which of this organization's
  components the advisory matches, with the asset column shown.
- Each shows up to 10 rows and links to the filtered Matches page for the rest; each has its own
  empty sentence that explains the absence rather than leaving a blank.

## Responsive and motion

- Verified at 360, 768 and desktop with no horizontal overflow; grids declare `minmax(0,1fr)`
  tracks and the Asset column follows the table's own width (container query), as in Phase 5–6.
- Filters collapse into a disclosure below 1024px; controls stay ≥44px.
- Under reduced motion, transitions collapse and content appears without movement; the Recalculate
  button's spinner is the only animation and it is `motion-safe` only.
