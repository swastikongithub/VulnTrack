# Page overrides — Organization area

Extends `../MASTER.md` for the organization shell (Assets, Members and Settings; asset pages: `assets.md`), `/organization/members`, `/organization/settings` and the invitation link
`/invite` (which lives in the auth layout and follows `auth.md`).

## Shell

```
OrganizationLayout (lazy route chunk)
├── atmosphere (fixed, aria-hidden): ion/blue hazes + static PerimeterMotif line art + grain
├── sticky header: Logo → /session │ OrganizationSwitcher │ user name/email · Sign out
├── nav: "Workspace" rail (≥1024, sticky; active item = layoutId indicator + Ion rail)
│         segmented control (<1024, same component as the auth ModeSwitch pattern)
└── main#organization-content: page keyed by organization id + path (fade/blur entrance)
```

- **No WebGL here.** Product surfaces are data-dense, so the Perimeter appears only as static line
  art (`PerimeterMotif`): rings, tick marks and a few status-colored nodes. No continuous motion,
  so no pause control is needed.
- **Header:** solid `ink-950/90`, no `backdrop-filter`.
- **Content width:** max 80rem; side nav 14rem.

## Components introduced

| Component | Where | Notes |
|---|---|---|
| `SelectField` | design-system | Native `<select>` styled like `TextField` (well, ring states, instrument brackets). `compact` = 44px row control with `aria-label`. |
| `Dialog` | design-system | Native `<dialog>` + `showModal()` (focus trap, Escape, inert background). Focus starts on the least destructive action and returns to the opener. `tone="danger"` tints the top hairline. |
| `Button variant="danger"` | design-system | Destructive confirmation inside a Dialog only. |
| `OrganizationSwitcher` | organization | Menu button + `menuitemradio`; ↑/↓/Home/End/Escape; current item checked; per-item spinner while switching. |
| `Readouts` | organization | Instrument-style counts. **Real values only**; `—` when the caller can't see a value. |
| `Panel` | organization | Section card: eyebrow + label heading (focusable, used as focus fallback) + hairline highlight. |
| `RoleBadge` | organization | Dot + label chip. Tones: owner Ion, admin Iris, analyst Info, developer/viewer neutral. Never severity colors. |
| `Avatar`, `OrganizationMark` | organization | Initials; organization tile carries a small open perimeter arc (logo echo). |

## States

| State | Treatment |
|---|---|
| Loading | Skeleton rows (`animate-pulse`, static under reduced motion) with `role="status"` label |
| Load error | Danger `Alert` + "Try again" (retries only that panel) |
| Action in flight | Row controls disabled; spinner beside the role select; button loading label; sr-only status |
| Action success | Check beside the role select, success Alert for invites, polite live-region announcement |
| Action rejected (403 / 404 / 409) | Danger Alert with specific copy; capabilities and lists refresh quietly (stale view) |
| Removed row | Exit slide; focus moves to the panel heading (not lost to `<body>`) |
| No permission for a section | Section omitted, or an explanatory notice (member list for developers/viewers) |
| No organization | Warning eyebrow + explanation (removed from last organization) |
| Session gone (401) | Session store expires → redirect to `/login?next=…` |

## Invitation screen (`/invite`)

Uses the auth screen system (StatusEmblem, ScreenHeader, Stagger), with the artwork in `verify` mode:

| View | Emblem | Actions |
|---|---|---|
| checking | progress | — |
| ready (signed out) | pending | Sign in to accept · Create an account |
| ready (signed in, email matches) | pending | Accept invitation · Not now |
| ready (different email) | pending + warning Alert | Sign out and switch account · Back to my session |
| already a member | pending + info Alert | Open organization |
| accepted | success (artwork → success) | Open organization |
| invalid / expired | failure / expired | Back to sign in |
| unavailable (network or rate limit) | failure | Try again |

## Responsive

- **<768:** member rows stack (identity + remove button, then a full-width role select, then the joined date); invitation actions go full width; the logo collapses to the mark (44px target).
- **Verified live:** no horizontal overflow at 360, 375 and 768; all interactive targets ≥44px.
