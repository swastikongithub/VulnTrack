# Authentication — Architecture

Real authentication for VulnTrack: accounts, organizations (tenants), owner memberships,
server-side sessions, email verification and password recovery. It plugs into the existing
authentication UI without changing its design.

| Document | Contents |
|---|---|
| [session-strategy.md](./session-strategy.md) | Decision record: why server-side sessions in httpOnly cookies |
| [api.md](./api.md) | Endpoint contracts and error codes |
| [environment.md](./environment.md) | Environment variables, local setup |
| [security.md](./security.md) | Controls implemented, review findings, hardening backlog, assumptions |

---

## System overview

```
Browser (React SPA)                          API (Express)                         MongoDB (replica set)
────────────────────                         ─────────────                         ─────────────────────
pages ─ useAuthForm                          routes ─ validateBody (zod)           users
  │                                             │                                  organizations
services/auth/authService (facade)           controllers (HTTP only)               memberships
  │   └─ mock (dev preview only)                │                                  sessions        (TTL)
services/api/httpClient ── fetch /api ──►    middleware:                           authtokens      (TTL)
  credentials: include                         helmet · cors · originGuard (CSRF)  ratelimits      (TTL)
  AuthError(code, meta)                        requireJsonBody · loadSession       auditlogs
                                               requireAuth · requireMembership
sessionStore ◄── GET /auth/session             requirePermission
                                                │
                                              services: auth · session · token · rateLimit
                                                        organization · password · email · audit
```

In development, Vite proxies `/api` to the API, so the browser sees one origin and the session
cookie is first-party.

## Backend layout (`server/src`)

| Folder | Responsibility |
|---|---|
| `config/` | `env.js` (validated env, fail fast), `security.js` (password/token/rate-limit policy), `roles.js` (RBAC), `database.js` |
| `models/` | `User`, `Organization`, `Membership`, `Session`, `AuthToken`, `RateLimit`, `AuditLog` |
| `validators/` | zod request schemas (messages match the UI's field copy) |
| `middleware/` | request context, CSRF origin guard, JSON-only bodies, session loading, auth/tenant/permission guards, validation, error shaping |
| `services/` | all business rules; controllers never make security decisions |
| `controllers/` | HTTP adapters (status codes, cookies) |
| `routes/` | endpoint wiring |
| `app.js` / `server.js` | app factory (dependencies injected for tests) / process bootstrap |

## Data model

```
User ──< Membership >── Organization
 │         role: owner | admin | security_analyst | developer | viewer
 │         status: active | suspended
 ├──< Session      (tokenHash, persistent, expiresAt, idleExpiresAt, activeOrganizationId)
 └──< AuthToken    (tokenHash, purpose: email_verification | password_reset, expiresAt, consumedAt)
AuditLog  (action, outcome, actorUserId?, organizationId?, subjectFingerprint?, reason, ip, userAgent, requestId)
RateLimit (key, count, resetAt)
```

| Collection | Key indexes | Notes |
|---|---|---|
| users | `emailNormalized` unique | `passwordHash` is `select: false` (Argon2id PHC string) |
| organizations | `slug` unique | `createdBy` |
| memberships | `(organizationId, userId)` unique; `(userId, createdAt)` | The tenant boundary; one role per org |
| sessions | `tokenHash` unique; `userId`; TTL on `expiresAt` | Only SHA-256 digests of cookie values |
| authtokens | `tokenHash` unique; `(userId, purpose, consumedAt)`; TTL on `purgeAt` | Kept 7 days past expiry so old links report "expired" |
| ratelimits | `key` unique; TTL on `resetAt` | Fixed windows |
| auditlogs | `createdAt`; `(actorUserId, createdAt)`; `(organizationId, createdAt)` | Append-only from the app |

Future tenant-owned collections (assets, findings, …) must carry `organizationId` and be read
only through a resolved membership.

## Flows

**Signup.** The client validates. On the server:
1. zod validation, then the password policy (length, and no name or email in the password).
2. Argon2id hash.
3. One **transaction** creates the User (unverified), the Organization, the owner Membership and a verification token.
4. The verification email is dispatched without blocking the response.
5. Response: `202 { email, verificationRequired: true }`.

An existing email gets the *same* response. No second account is created, and the address owner
receives an "account exists" notice (rate-limited).

**Email verification.** The link opens `/verify-email?token=…`. The SPA POSTs the token, which is
consumed atomically (single use) and sets `emailVerifiedAt`. Resend invalidates earlier tokens and
has a 60 s cooldown plus an hourly cap.

**Login.** Checks run in this order:
1. IP window.
2. Per-account failure lock.
3. User lookup with password verification. Unknown accounts run a dummy Argon2 verification so timing matches.
4. A generic `INVALID_CREDENTIALS` on any failure.
5. `EMAIL_NOT_VERIFIED`, which is revealed only after a correct password.

On success: the failure counter is cleared, any presented session is revoked, a **new** session is
created and the cookie is set. The response carries user, active organization, role, memberships
and session info.

**Session.** `GET /auth/session` resolves the cookie and enforces absolute and idle expiry, user
status, verification and "password changed after session created". Logout deletes the server
session and clears the cookie.

**Password recovery.**
1. Forgot: always `202`. For an active account, earlier reset tokens are invalidated and a 30-minute token is emailed.
2. Validate: a non-consuming check that drives the UI's checking → form / expired / invalid states.
3. Policy check against the account's name and email, then Argon2id hash.
4. One **transaction**: consume the token, update the password (and mark the email verified), revoke **all** sessions, invalidate remaining reset tokens.
5. The login lockout is cleared and a "password changed" email is sent.

## Tenancy & RBAC foundation

- Roles live on the membership, never globally on the user. The permission map is in
  `config/roles.js`: `organization:read|update` and `members:read|manage`.
- `requireMembership()` resolves `(organizationId from route, authenticated userId)`. Non-members
  get **404**, so organization ids can't be probed. `requirePermission()` then checks the role.
- Foundation endpoints: `GET /organizations`, `GET /organizations/:id`,
  `GET /organizations/:id/members` (requires `members:read`).
- Invitations, role changes and organization switching are deliberately **not** built (Organization + RBAC phase).

## Frontend integration

The UI was not redesigned. Real API outcomes map onto the existing states:

| API outcome | Existing UI state |
|---|---|
| request in flight (≥700 ms pacing) | button loading label + perimeter contraction + HUD "Verify" |
| `INVALID_CREDENTIALS` | "Email or password is incorrect" alert + error impulse |
| `RATE_LIMITED` `scope: account` | countdown on the submit button for that email + alert |
| `RATE_LIMITED` `scope: client` | countdown for any email + network-scoped copy |
| `EMAIL_NOT_VERIFIED` | warning alert + "Resend verification email" → verify screen |
| `VALIDATION_FAILED` with `fields` | messages in the existing field rows (`useAuthForm.applyServerErrors`) |
| login `200` | success button → session hand-off → `/session` |
| `TOKEN_EXPIRED` / `TOKEN_INVALID` | existing expired / invalid link screens |
| network failure / gateway error | "Can't reach VulnTrack" |
| `SERVER` | "Something went wrong on our side" |

Changes made to the UI (smallest necessary):
- **Real session store:** `sessionStore` bootstraps from `GET /auth/session`; nothing is kept in web storage.
- **Signed-in screen:** now shows the real workspace and role, and reports a failed sign-out honestly.
- **Reset link check:** a network failure gets an "unavailable" state with retry (previously it would have said "invalid link").
- **Verify screen:** requests are de-duplicated per token, so StrictMode or a remount can't consume a single-use token twice.
- **Rate-limit copy:** now depends on the context (sign-in, sign-up, recovery, verification).
- **Password checklist:** reflects the server's "contains your name or email" verdict on the reset screen.
- **Referrer policy:** `no-referrer`, so one-time tokens in URLs never leak.
- **Design-preview mock:** still available in development only (`VITE_AUTH_MODE=mock`) and removed from production bundles.
