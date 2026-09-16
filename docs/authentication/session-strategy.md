# Decision: Server-side sessions in httpOnly cookies

**Status:** accepted (authentication backend phase)

## Context

VulnTrack is a browser SPA talking to its own API. It will hold sensitive security data for
multiple organizations, so it needs:
- reliable revocation (logout, password reset, future admin/offboarding actions)
- multiple devices per user
- "keep me signed in"
- an authorization model that later scopes every request to an organization

The master plan leaves the mechanism open: "secure cookie-based sessions or appropriately
implemented token/session architecture… do not choose solely for trend reasons."

## Options considered

| | Opaque session id in httpOnly cookie, state in DB | JWT access token in JS memory/web storage + refresh token | JWT in httpOnly cookie (stateless) |
|---|---|---|---|
| XSS token theft | Script can't read the cookie | Tokens are script-readable; theft is persistent | Script can't read it |
| Revocation (logout, password reset) | Immediate: delete the row | Needs denylist or short TTL + refresh rotation | Needs denylist, which makes it stateful anyway |
| CSRF exposure | Yes, mitigated (below) | None for bearer headers | Yes, mitigated the same way |
| Multi-device visibility | Natural (one row per device) | Requires refresh-token tracking | Requires tracking |
| Complexity | Low | High (rotation, reuse detection, silent refresh) | Medium, with worse revocation |
| Per-request DB lookup | Yes (indexed, trivial at this scale) | No | No |

## Decision

Use **opaque, random, server-side sessions** referenced by an **httpOnly cookie**.

- **Session id:** 256-bit random (`crypto.randomBytes(32)`, base64url). Only its **SHA-256 digest** is stored, so a database leak does not yield usable sessions.
- **Cookie:** `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` in production. In production it is named `__Host-vt_session`, which forces Secure, host-only and `Path=/`.
- **Lifetimes:**

  | | Absolute | Idle | Cookie |
  |---|---|---|---|
  | Default | 12 h | 2 h | browser-session cookie (ends when the browser closes) |
  | "Keep me signed in" | 30 days | 7 days | persistent cookie with `Expires` |

  Idle expiry slides on use, written at most every 5 minutes. A Mongo TTL index reaps expired rows.
- **Fixation:** login always issues a new id and revokes any session the browser presented.
- **Invalidation:**
  - Logout deletes the current session.
  - Password reset deletes **all** sessions for the user, in the same transaction as the password change.
  - Any session created before `passwordChangedAt` is rejected even if deletion raced.
  - Disabled or unverified users are rejected on every request.
- **Multi-device:** independent sessions per device. Logout affects only the current device.
  "Sign out everywhere" and a device list are straightforward future additions (`sessions` by `userId`).
- **Organization context:** each session stores `activeOrganizationId`. Authorization always
  re-resolves the membership per request, so it is never trusted from the session alone.

## CSRF defenses (because the browser sends the cookie automatically)

1. **Origin verification** on every state-changing request. `Origin` (or `Referer`) must exactly
   match `APP_ORIGIN` / `ALLOWED_ORIGINS`, otherwise `403 CSRF_REJECTED`.
2. **SameSite=Lax:** cross-site subresource and POST requests don't carry the cookie.
3. **JSON-only bodies:** a cross-site HTML form cannot produce `application/json`, and a
   cross-origin `fetch` with it triggers a CORS preflight, which the CORS policy denies.
4. **Strict CORS:** credentials are allowed only for the configured origins, and only `Content-Type` headers.

## Consequences

- **Same-site deployment required.** The web app and API must be on the same *site*
  (e.g. `app.example.com` + `api.example.com`, or the API routed under `/api` on the app host).
  Cross-site hosting would require `SameSite=None`, which is intentionally unsupported.
- **One indexed session read per authenticated request.** Moving the session store to Redis later
  (when Redis is introduced for BullMQ) would not change the cookie contract.
- **The client never touches tokens.** The SPA learns who is signed in by calling
  `GET /api/auth/session`.
