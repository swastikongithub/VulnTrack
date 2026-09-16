# Page overrides — Authentication

Extends `../MASTER.md` for Login, Signup, Forgot Password, Reset Password, Email Verification
and the signed-in hand-off screen.

## Architecture

```
AuthLayout (persistent across all auth routes)
├── ArtworkStage (fixed, aria-hidden)
│   ├── atmosphere gradients (ion / iris / success haze)
│   ├── PerimeterCanvas — lazy R3F scene  ─┐
│   ├── LifecycleHud — SVG instrument ring ─┤ both registered to the art anchor
│   └── vignette + grain                   ─┘ via --art-cx / --art-cy / --art-r
├── art anchor  (desktop: sticky left column · mobile: top art window)
│   ├── header (logo, pause motion on mobile)
│   └── ArtCaption + pause motion (desktop)
└── main panel
    ├── ModeSwitch (login/signup only, shared-layout indicator)
    └── AnimatePresence → route screen (direction by flow depth)
```

The artwork never unmounts between routes, so a screen change reads as a state change of one system.
UI → artwork communication goes through `sceneStore` (a small external store). The WebGL loop reads
it every frame without React renders; DOM layers subscribe to narrow slices.

## The artwork: "Perimeter"

An organization's attack surface, drawn as a lattice of asset nodes on a spherical perimeter around a
protected core:

| Element | Meaning |
|---|---|
| ~880 nodes (520 on low tier), Fibonacci-distributed, nearest-neighbour links | Assets and their relationships |
| Warm / red pulsing nodes (~9%) | Findings / critical findings |
| Horizontal scan plane sweeping the sphere | Continuous discovery / assessment |
| Packets travelling along links | Data flowing through the surface |
| Icosahedral core with fresnel glow | What's being protected |
| Tilted orbit ring + tick orbit + satellite | Depth / perspective layers |
| HUD ring with 8 stages | The product's vulnerability lifecycle (Discover → Close) |

Geometry is seeded, so it's identical on every load and matches the static SVG fallback (no WebGL).

### State mapping

| UI state | Artwork reaction |
|---|---|
| idle | Slow rotation, gentle scan, HUD narrates the lifecycle every 3.8s |
| field focus | Energy up, faster scan |
| loading | Perimeter contracts, rapid scan and spin, HUD locks to **07 Verify** |
| error (validation or auth) | Nodes shiver, findings and scan flash danger, HUD indicator turns red (decays ~1.4s) |
| success | Findings resolve to **verified green**, HUD lights all 8 segments (**Close**) |
| session transition | Camera dollies into the core while the hand-off steps run |
| signup | Surface is **provisioned** as fields become valid (reveal 38% → 100%) |
| forgot / reset (recovery) | Palette shifts to **Iris** ("re-keying"), orbits reverse |
| verify | Handshake pulse wave from the core every 2.6s |
| pointer (fine pointers) | Lens highlight under the cursor, tilt parallax, dust counter-parallax |
| desktop panel edge | A light on the panel's left hairline tracks the scan plane's screen height |

## Layout

| Width | Layout |
|---|---|
| < 768 | Art window on top (`clamp(15rem, 40svh, 22rem)`), perimeter radius ≤124px, HUD ring without labels. The form sheet (rounded top, top highlight) scrolls over it; ScrollTrigger scrubs the scene and HUD upward at 0.55× and fades them. Rendering stops once scrolled away. |
| 768–1023 | Same, with a taller art window and the sheet as a centered 36rem card. |
| ≥ 1024 | Sticky art column (flex-1) + fixed-width panel `clamp(28rem, 36vw, 38rem)`. HUD shows stage labels; the radius is clamped so ring + labels always fit the column. Caption + pause control sit bottom-left. |

## Flow rules

- **Login:** generic credential error; account-scoped rate-limit countdown (disables submit only for the throttled email); unverified accounts get a resend path; "Keep me signed in" chooses session persistence.
- **Success:** button success (650ms), then the hand-off sequence (credentials → workspace membership → session), then `/session`.
- **Signup:** always proceeds to verification with identical responses (no account enumeration). Error summary on submit.
- **Forgot password:** always shows "If an account exists…"; resend with a 60s cooldown; "use a different email" escape.
- **Reset password:** checks the link first (checking → form | expired | invalid); success states that other sessions were signed out, then goes to login with a confirmation.
- **Verify email:** pending (inbox + resend cooldown) | verifying | success | expired / invalid (resend, asking for the email if unknown) | server error (retry).

## Mock backend (this phase only)

`client/src/services/auth/authService.js` implements the async contract with deterministic scenarios.
In development, the **Preview states** panel fills forms, links to token states and overrides the
motion preference.

| Input | Result |
|---|---|
| any email + `incorrect-password` | Invalid credentials |
| `locked@…` | Rate limited (30s) |
| `unverified@…` | Email not verified |
| `offline@…` / `error@…` | Network / server error |
| `?token=valid / expired / invalid / error` | Verify / reset link states |
