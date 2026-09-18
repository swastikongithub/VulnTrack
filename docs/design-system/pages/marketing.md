# Page overrides — Marketing (landing page)

Extends `../MASTER.md` for the public page at `/`. Code: `client/src/features/marketing/`.

## Principles

- **Only what ships.** Copy describes implemented functionality: authentication, organizations and
  RBAC, member management, tenant isolation and asset management. Anything else appears only in
  the Roadmap section under a **Next** or **Planned** tag, never as a feature.
- **No fake telemetry.** Nothing is labelled "live". The product preview uses a fictional
  organization ("Halcyon Labs", `.example` domains, documentation IP ranges) and says so twice.
- **Claims are checkable.** Every line in the Security section maps to a control in
  `docs/authentication`, `docs/organization` or `docs/assets`, and avoids absolute claims. The
  permission matrix (`data/access.js`) mirrors `server/src/config/roles.js`. The identifier demo
  (`lib/identifierPreview.js`) is a browser copy of `server/src/utils/assetIdentifiers.js`.
  **When those server files change, update the mirrors.**
- **Separate from the app.** `/` is its own lazy route chunk. It only reads the session status (to
  swap "Create workspace" for "Open workspace") and links into the auth routes.

## Structure

| # | Section | Anchor | Notes |
|---|---|---|---|
| — | Nav | — | Transparent over the hero, solid after 12px, hairline scroll progress; disclosure menu below 768px |
| — | Hero | — | Headline, one-paragraph definition, CTAs, availability line (Available now / Next), four facts |
| 01 | The inventory (story) | `#product` | Three steps; the fixed artwork morphs in step |
| 02 | Product preview | `#preview` | Working replica of the inventory built from `AssetSignals`, with local search, filters and selection |
| 03 | Identifiers | `#identifiers` | Normalization demo; compares against the sample inventory |
| 04 | Teams & access | `#access` | Role radio group drives the permission matrix; four hierarchy/isolation rules |
| 05 | Security | `#security` | Numbered spec sheet, 01–09 |
| 06 | Roadmap | `#roadmap` | Available now / Next / Planned tracks |
| — | Final CTA, footer | — | Footer notes that the sample data is fictional |

## Artwork (`artwork/`)

A fixed WebGL layer behind the hero and the story: one particle per notional asset, in four states
that mirror the product (`surfaceField.js`).

| State | Shape | Meaning |
|---|---|---|
| 0 Unmapped | grey cloud | Systems nobody has recorded |
| 1 Inventoried | Fibonacci sphere + perimeter ring | One inventory |
| 2 Classified | four tilted rings, `sev-*` colours, ion rings on ~11% of points | Criticality tiers; internet-facing |
| 3 Owned | five clusters with team labels | Owning teams |

- **GPU morph:** every point carries all four positions as attributes. `uProgress` (0–3) blends
  them with a per-point stagger. The shader projects straight to CSS pixels, so the DOM labels
  (tier names, team names) use the same layout numbers (`layoutFor`).
- **Layout breakpoints:** `layoutFor` uses the same media queries as the CSS. The canvas width
  excludes the scrollbar, so comparing widths would disagree with CSS at exactly 1024px.
- **Drivers:** the hero intro tweens `intro` 0→1. The story ScrollTrigger writes `story` 0→2, with
  each step holding its state and morphing in its first 40%. Page scroll adds a little rotation.
  All of these write plain numbers to `surfaceMotion`; there are no React renders while scrolling.
- **Fade and stop:** the layer fades out as the product preview arrives. At zero opacity it is
  hidden and rendering switches to on-demand.
- **Budget:** 1,400 points (700 on small or low-power devices), DPR ≤ 1.75, no antialias or depth
  buffer. three.js loads in its own chunk after the page is interactive.
- **Fallback:** without WebGL, the static `PerimeterMotif` SVG takes the artwork's place.
- **Deliberately not reused:** the auth `PerimeterCanvas`. It shows findings resolving, and
  findings don't exist yet.

## Motion

- **No pinning and no scroll-jacking.** The story uses a normal scrolling column, and the artwork is
  fixed behind it. Lenis (existing) smooths the wheel; anchor links scroll through it
  (`lib/scrollToSection.js`) and then focus the section's h2.
- **Scroll-linked effects:**
  - hero parallax and fade
  - product-preview tilt-in (≥1024px only)
  - roadmap track fill
  - nav progress hairline

  All use Framer motion values, so nothing re-renders.
- **Reveals:** `Reveal` fades content up once as it enters.
- **Reduced motion** (OS setting or `vt:motion-override`):
  - no intro or rotation
  - the artwork jumps between discrete states on demand
  - no parallax, tilt or track fill
  - Framer transforms off (opacity only)
  - no Lenis

## Responsive

- **≥1024:** copy column left, artwork right.
- **<1024:** the artwork sits in the upper viewport. Hero copy starts at mid-height, and story steps
  become solid cards that scroll over the artwork. Tier and team labels show from 640px.
- **Preview:** a table from 768px (cards below). The detail pane sits beside the list from 1280px;
  below that it sits underneath and scrolls into view when you select an asset.
- **Access matrix:** below 768px only the selected role's column is shown.
- **Verified:** 360, 375, 768, 1024 and 1440px with no horizontal overflow.

## Accessibility

- **Skip link:** "Skip to content".
- **Landmarks:** Main nav, page-sections nav and account nav.
- **Headings:** one h1 (hero); each section has an h2 with `aria-labelledby`.
- **Artwork:** `aria-hidden`; the story copy says in words what each state shows, including a text
  legend for colour meaning.
- **Controls:**
  - Role selector: native radios (arrow keys work), with the focus ring on the label.
  - Preview filters and presets: `aria-pressed`.
  - Result counts and outcomes: `aria-live="polite"`.
- **Mobile menu:** a disclosure with `aria-expanded`/`aria-controls`. Escape closes it and returns
  focus to the toggle; outside clicks and resizing past 768px also close it.
