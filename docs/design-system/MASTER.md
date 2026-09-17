# VulnTrack Design System — MASTER

Global source of truth for VulnTrack's visual and interaction language. Page files in
`docs/design-system/pages/` may extend or override these rules. When they conflict, the page
file wins for that page only.

Established during the authentication UI/UX phase (see `pages/auth.md`). The implementation lives in:

| Concern | Location |
|---|---|
| Tokens (color, type, radii, elevation, motion CSS, breakpoints, z-index) | `client/src/index.css` |
| Motion tokens for JS (Framer Motion / GSAP) | `client/src/design-system/motion/tokens.js` |
| Reduced-motion + smooth scroll providers | `client/src/design-system/motion/` |
| Reusable components | `client/src/design-system/components/` |

---

## 1. Direction

**"Instrument-grade calm."** VulnTrack should feel like a precise security instrument: dark,
quiet surfaces and exact typography. Colour and light appear only where they carry meaning, like
a signal, a finding or a verified state.

- Dark, blue-black ground rather than neutral grey. The depth comes from light on dark, not from glass stacked on glass.
- One luminous brand signal (**Ion**) plus one secondary accent (**Iris**) that marks recovery and key flows.
- Monospace is used for *metadata* (eyebrows, HUD labels, IDs, counters). Never use it for body copy.
- Technical detail comes from hairlines, tick marks and the **instrument bracket** focus accent, not from decorative gradients.

**Avoid:** Matrix rain, glitch effects, scanline overlays, neon green, skulls, fake terminals,
generic Tailwind dashboard cards, glassmorphism stacks, and fake live telemetry (never label
something "live" unless a real data source backs it).

> UI/UX Pro Max was used as guardrails (accessibility, forms, motion, responsive, performance).
> Its generated style recommendation for this domain ("Cyberpunk UI": `#00FF41`, glitch, scanlines)
> was deliberately rejected: it is the cliché the product plan rules out.

---

## 2. Color

All components use **semantic tokens** (`bg-surface`, `text-fg-muted`, `ring-line`, …) and never raw hex.
Contrast figures were measured against `ink-850` (panel) unless noted.

### Surfaces (ink scale)
| Token | Hex | Use |
|---|---|---|
| `ink-950` | `#05070b` | App ground, behind artwork |
| `surface` (`ink-850`) | `#0b0f17` | Primary panels |
| `surface-raised` (`ink-800`) | `#0f141e` | Cards, secondary buttons, data lists |
| `surface-well` (`ink-750`) | `#131a26` | Inputs (recessed, with inset shadow) |
| `surface-hover` (`ink-700`) | `#1a2231` | Hover / active fills |
| `ink-600` | `#242e40` | Empty meter tracks, neutral dots |

### Lines
`line-subtle` (8%), `line` (14%), `line-strong` (26%): all `rgb(148 170 210 / α)`. Use hairlines
(1px) for structure. Separate surfaces with a line or elevation, never with both a heavy border and a shadow.

### Text
| Token | Contrast | Use |
|---|---|---|
| `fg` | 16.3:1 | Headings, values, input text |
| `fg-muted` | 8.4:1 | Body copy, descriptions |
| `fg-subtle` | 5.4:1 (4.5:1 on `ink-700`) | Meta text, placeholders, hints. **Not** for long-form copy |
| `fg-disabled` | — | Disabled / decorative only; never carries information |

### Accents
| Token | Hex | Meaning |
|---|---|---|
| `ion` | `#7cdcff` | Primary action, focus, links, active state, "signal" |
| `on-ion` | `#03121a` | Text on Ion (12.3:1) |
| `iris` | `#a497ff` | Recovery / credentials / key flows (secondary accent) |

### Status (always paired with icon + text, never color alone)
`success #4ae3a5` · `warning #f6c25b` · `danger #ff7385` · `info #8fb4ff`, each with a `*-dim` 12%
fill for alert backgrounds. All pass 4.5:1 as text on every surface.

### Severity (reserved for product UI)
`sev-critical #ff4f6d` · `sev-high #ff8a4c` · `sev-medium #f6c25b` · `sev-low #7fa7ff` · `sev-none #7d899c`.
Severity is always shown with a text label. **Ion is never used to mean severity.**

---

## 3. Typography

- **Sans:** Geist Variable. **Mono:** Geist Mono Variable. Both are self-hosted via `@fontsource-variable` (no third-party requests).
- Use tabular numerals (`.tabular`) for timers, counters, IDs and data columns.

| Role | Class | Size / line-height | Weight | Tracking |
|---|---|---|---|---|
| Display | `text-display` | 40 / 1.08 | 560 | −0.035em |
| Title 1 (page h1) | `text-title-1` | 30 / 1.15 (34 at ≥640px) | 560 | −0.028em |
| Title 2 | `text-title-2` | 20 / 1.35 | 560 | −0.015em |
| Body large / inputs | `text-body-lg` | 16 / 1.6 | 400 | — |
| Body | `text-body` | 15 / 1.6 | 400 | — |
| Label | `text-label` | 14 / 1.35 | 500 | — |
| Caption | `text-caption` | 13 / 1.45 | 400 | — |
| Eyebrow (mono, uppercase) | `.eyebrow` | 12 / 1.3 | 400 | +0.14em |

Rules:
- Inputs are always ≥16px (prevents iOS zoom).
- Nothing below 12px.
- Screen headings use `text-wrap: balance`.
- An **eyebrow** (mono, uppercase, with a 20px leading hairline) marks the step or context above a page h1, and its color follows the flow accent (Ion / Iris / status).

---

## 4. Spacing, radii, elevation

- **Spacing:** Tailwind's 4px scale. Rhythm tiers:
  - 4–8: inside a control
  - 12–16: between related items
  - 24–32: between groups
  - 40+: between sections
- **Form rhythm:** each field reserves its message row (`min-h-5` + 8px padding), so errors never shift layout.
- **Radii:**
  - `xs` 4: focus outlines
  - `sm` 6: icon buttons
  - `md` 10: controls, inputs, buttons
  - `lg` 14: alerts, cards
  - `xl`/`2xl` 20/28: sheets and panels
  - `full`: chips and floating toggles only
- **Elevation:**
  - `shadow-e1`: raised controls
  - `shadow-e2`: floating toggles
  - `shadow-e3`: sheets, popovers

  Each level combines a 1px inner top highlight with a soft drop shadow. Don't invent shadow values.

---

## 5. Iconography

- **Lucide** only. Stroke **1.75** in fields, **2–2.5** for small status glyphs (checks inside 16–20px chips).
- Sizes:
  - 17px: field and leading icons
  - 13–16px: inline icons
  - 18px: alerts
  - 22px: emblems
- Icons beside visible text use `aria-hidden="true"`. Icon-only controls use `IconButton`, which requires `label`.
- No emoji as icons.

---

## 6. Components

All components live in `design-system/components` (import from the barrel `@/design-system/components`).

### Button
- **Variants:** `primary` (Ion fill, inner highlight, glow, hover sheen), `secondary` (raised surface + hairline), `ghost`, `danger` (destructive confirmations inside a Dialog only).
- **Sizes:** `lg` 48px (default for forms), `md` 44px. Never smaller than 44px on touch layouts.
- **One primary button per screen.**
- **States:** `loading` → spinner + `loadingLabel`, `aria-disabled`, still focusable. `success` → check + `successLabel`, green fill. Labels crossfade in a fixed cell, so width never animates.
- **Press:** spring scale 0.975. Hover sheen only on `(hover: hover)` devices.
- Pair async buttons with an `sr-only` `role="status"` message ("Verifying credentials").

### TextField / PasswordField
- Visible label above the field, never a placeholder-only label. 48px input on `surface-well` with an inset shadow.
- **Focus:** 2px Ion ring **plus instrument brackets** (four L-corners scale in). This is VulnTrack's signature focus treatment and should be reused for other focusable surfaces that need emphasis.
- **Invalid:** danger ring and danger brackets; the message row shows an icon, an "Error:" prefix for screen readers, and specific cause + fix copy.
- Validate on **blur**. Once a field is touched (or after a submit), re-validate while typing so errors clear the moment they're fixed.
- Ring state classes are **mutually exclusive** (valid vs invalid), so they never compete in the cascade.
- **PasswordField:** show/hide toggle (`aria-pressed`, 44px target) and a Caps Lock warning. Paste and password managers are always allowed.
- Use the correct `type`, `inputMode` and `autoComplete` (`username`, `current-password`, `new-password`, `email`, `name`, `organization`).

### Checkbox
Native input with a 44px invisible hit area; the custom 20px box has a check scale-in animation and a focus ring.

### Alert
`danger | warning | success | info`. Icon + title (+ body + action) on a 12% tint with a 3px left
rail. `danger`/`warning` use `role="alert"`; the others use `role="status"`. Use alerts for form-level
outcomes (auth failures, sent confirmations), not for field errors.

### ErrorSummary
Shown after a failed submit with ≥2 invalid fields. It receives focus, links each item to its field
and keeps the inline errors visible. With a single error, focus goes to that field instead.

### PasswordStrength
Four segments filled with `scaleX` (no layout change) plus a text level. The requirement checklist
uses icon + text + a screen-reader "met/not met" state. Policy: ≥12 characters and no name/email
(NIST 800-63B); character variety is recommended, not required.

### SelectField, Dialog (organization phase)
- **SelectField:** native `<select>` with the TextField well, ring states and brackets. The `compact` variant (44px, `aria-label`) is for table rows.
- **Dialog:** native `<dialog>` via `showModal()`. Focus starts on the least destructive action and returns to the opener; Escape and backdrop close it. Destructive confirmations use `Button variant="danger"`, the only place that variant appears.

Page-specific rules: `pages/organization.md`.

### TextLink, IconButton, Spinner, Logo
- **TextLink:** Ion, underline on hover; standalone links get `min-h-11`.
- **IconButton:** requires `label`.
- **Spinner:** decorative; always pair it with status text.
- **Logo:** the mark is an open perimeter ring, an inner verification arc, a tracked boundary node and the core.

---

## 7. States (global rules)

| State | Treatment |
|---|---|
| Hover | Surface lift (`surface-hover`) or line strengthen; 160ms. Pointer devices only. |
| Focus-visible | 2px Ion outline, 3px offset (inputs: ring + brackets). Never removed. |
| Pressed | Spring scale 0.92–0.975. |
| Disabled | 45% opacity, `not-allowed`, semantic `disabled`. |
| Loading | Keep the control in place; swap the label; announce via `role="status"`. |
| Error | Danger ring/text + icon + specific copy; focus management as in §6. |
| Success | Green accent + check; brief confirmation before navigating. |
| Empty/expired links | Status emblem + heading + clear recovery action (never a dead end). |

Security copy rules: never reveal whether an account exists. Use generic credential errors and identical
"if an account exists…" confirmations, and nothing sensitive in error messages.

---

## 8. Motion

Principles:
1. **Motion expresses cause and effect.** State changes (loading, error, success, route depth) drive motion; decoration alone doesn't.
2. **Enter decelerates, exit accelerates**, and exits run at ~60% of the enter duration.
3. **Animate only `transform`, `opacity`, `filter`.** Never width, height, top or left. Reserve space instead.
4. **Interruptible by construction.** State-driven values ease toward targets (the WebGL uniforms, springs), so any new state simply retargets. Animations never block input.
5. **One rhythm.** Use the shared tokens below; don't add ad-hoc durations.

| Token | Value | Use |
|---|---|---|
| `instant` | 100ms | Message swaps out |
| `fast` | 160ms | Hover, color, exits of small elements |
| `base` | 240ms | Button label swaps, screen exit |
| `moderate` | 360ms | Alerts, meters |
| `slow` | 560ms | Screen / content entrance |
| `scene` | 1.2s | Artwork state transitions |

Easings: `standard [0.2,0,0,1]`, `enter [0.16,1,0.3,1]` (GSAP `expo.out`), `exit [0.4,0,1,1]`,
`emphasized [0.7,0,0.2,1]`. Springs: `press` (stiffness 520 / damping 32) and `layout` (380 / 34).

**Tool responsibilities:**
- **Framer Motion:** component and state transitions, route transitions (`AnimatePresence`), shared-layout indicators, staggered entrances (30–50ms per item).
- **GSAP:** choreographed SVG/HUD timelines. Always use `fromTo` with explicit end values when a timeline can re-run.
- **GSAP ScrollTrigger:** scroll-scrubbed progress (e.g. the mobile artwork parallax).
- **Lenis:** smooth wheel scrolling on fine pointers, driven by the GSAP ticker. Off on touch devices and under reduced motion.
- **React Three Fiber:** immersive artwork only.

**Direction:** forward navigation (deeper in a flow) enters from the right; backward enters from the left.

**Reduced motion** (`MotionPreferenceProvider`: the OS setting plus a dev override):
- Framer runs with `reducedMotion="always"` and CSS transitions collapse.
- WebGL switches to on-demand rendering: static, but it still shows state.
- Narration and parallax stop.
- Essential progress spinners keep turning slowly (`.motion-essential`).

Continuous ambient motion also gets a visible **Pause motion** control (WCAG 2.2.2).

---

## 9. Responsive

Breakpoints (mobile-first):
- `xs` 400
- `sm` 640
- `md` 768
- `lg` 1024: split layouts begin
- `xl` 1280
- `2xl` 1536
- `3xl` 1792

Validate at 360, 375, 768, 1024, 1440 and 1920.

- No horizontal scrolling at any width. `scrollbar-gutter: stable` prevents sideways shifts.
- Touch targets ≥44px on touch layouts; ≥24px minimum everywhere (WCAG 2.2).
- Use `dvh`/`svh` instead of `100vh`, and respect safe-area insets on fixed or edge UI.
- Large artwork is **adapted, not hidden**, on small screens (see `pages/auth.md`).
- Readable measure: form columns cap at ~408px.

---

## 10. Z-index layers

Defined as CSS variables. Use them instead of literal numbers.

| Layer | Var | Value |
|---|---|---|
| Scene / artwork | `--z-scene` | 0 |
| Atmosphere | `--z-atmosphere` | 10 |
| HUD | `--z-hud` | 20 |
| Content | `--z-content` | 30 |
| Sticky headers | `--z-sticky` | 40 |
| Popovers / menus | `--z-popover` | 50 |
| Toasts | `--z-toast` | 60 |
| Modal overlays | `--z-overlay` | 80 |
| Dev tools | `--z-devtools` | 90 |
| Skip link | `--z-skiplink` | 100 |

---

## 11. Accessibility baseline

- Semantic landmarks (`header`, `main`, `nav`), one `h1` per screen, and a skip link.
- On client-side navigation, focus moves to the new screen's `h1`. After an in-page state change (e.g. "Check your inbox"), focus moves to the new heading too.
- After a failed submit: focus the error summary (≥2 errors) or the first invalid field. Implemented with `flushSync` so repeat submits work.
- Messages in live regions: field messages `aria-live="polite"`; alerts use `role="alert"`/`role="status"`; async buttons have an sr-only status.
- Decorative artwork is `aria-hidden`, with an sr-only text description.
- Color is never the only signal.
- Keyboard order follows visual order. In particular, secondary links like "Forgot password?" come *after* the field they relate to.

---

## 12. Performance rules

- Heavy visuals load lazily in their own chunk (three.js + R3F ≈ 240 KB gzip). Forms are interactive before the artwork arrives, and the canvas fades in once ready.
- WebGL stops continuous rendering when: reduced motion is on, the user paused it, it's scrolled offscreen, or the tab is hidden. DPR is capped at 1.75 (1.5 on the low tier).
- **Never write CSS custom properties on `:root` per frame.** That restyles the whole document. Write per-frame values straight to the one element that needs them (`element.style.transform`).
- **No `mix-blend-mode` or `backdrop-filter` layers over a continuously animating canvas.** They force re-rasterizing every frame. (Together with root variable writes, this froze the renderer during development.) Grain uses plain alpha.
- Pointer handlers only store numbers; the frame loop smooths them.

---

## 13. Using UI/UX Pro Max

For new pages, run the skill's domain searches for the relevant concerns (`--domain ux`, `--stack react`,
`--domain chart` for dashboards) and treat the results as **guardrails**. Record page-specific
decisions in `pages/<page>.md`. Ignore React Native-specific guidance; this is a web application.
