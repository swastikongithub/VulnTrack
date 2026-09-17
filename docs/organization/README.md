# Organizations & RBAC

The multi-tenant authorization layer that every future VulnTrack domain (assets, findings,
remediation, scans…) builds on:

```
User ──< Membership (role, status) >── Organization
              │
              └─ role → permissions (config/roles.js) + hierarchy rules (organizationPolicy.js)
```

| Document | Contents |
|---|---|
| [organization-model.md](./organization-model.md) | Data model, current-organization resolution, switching, tenant boundaries |
| [rbac.md](./rbac.md) | Roles, permission matrix, hierarchy rules, every authorization decision |
| [invitations.md](./invitations.md) | Invitation lifecycle, token handling, acceptance rules |
| [api.md](./api.md) | Endpoint contracts and error codes |
| [security.md](./security.md) | Threat model, controls, tests, limitations, extension points |

Builds on [../authentication/](../authentication/README.md) (sessions, CSRF, rate limiting, audit).

## Architecture

```
routes/organizationRoutes.js     requireAuth → requireMembership(:organizationId | "current") → requirePermission(p) → validateBody
controllers/organizationController.js   HTTP only
services/
  organizationService.js   current-organization resolution, details, rename, switching
  memberService.js         list / get / change role / remove (transactional, owner-safe)
  invitationService.js     create / list / resend / revoke / inspect / accept
  organizationPolicy.js    pure hierarchy decisions (who may manage whom, which roles)
config/roles.js            roles, permission catalogue, grants (single source of truth)
middleware/authorize.js    tenant boundary + permission gate (+ audit of denied writes)
models/Invitation.js       new; Membership unchanged; Organization.rosterVersion (concurrency guard)
```

## How a request is authorized

1. `loadSession` resolves the httpOnly session cookie (authentication phase).
2. `requireAuth` → 401 without a session.
3. `requireMembership` resolves `:organizationId`:
   - `current` → the session's current organization, re-validated against an **active** membership
     (falls back to the oldest remaining membership and corrects the session);
   - an id → the caller's **active** membership in exactly that organization.
   - Not a member, unknown id, malformed id → identical `404 NOT_FOUND`.
4. `requirePermission(p)` checks the membership's role against the central grant table → `403`
   (denied state-changing requests are audited as `authorization.denied`).
5. `validateBody` (zod, unknown keys stripped).
6. The service applies hierarchy rules (`organizationPolicy.js`) and scopes every query by the
   resolved organization id, never by an id from the body.

## Frontend

| Route | Screen | Layout |
|---|---|---|
| `/organization/members` | members, invite form, pending invitations | `OrganizationLayout` (lazy-loaded) |
| `/organization/settings` | name, record details, "what your role allows" | `OrganizationLayout` |
| `/invite?token=…` | invitation check → sign in / accept / mismatch / expired / invalid | `AuthLayout` (Perimeter artwork) |

- `services/organization/organizationApi.js`: API client; `organizationErrors.js` maps codes to copy.
- UI capabilities come from the server: `permissions`, `assignableRoles` and per-row `actions`.
  Hidden controls are presentation only; the API re-authorizes every call (verified live with
  crafted requests).
- `/login?next=` accepts only allowlisted in-app paths (`lib/safeRedirect.js`), so invitation links
  survive sign-in without creating an open redirect.
- Visual rules for the organization console: `docs/design-system/pages/organization.md`.
