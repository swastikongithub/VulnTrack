# Authentication API

Base path: `/api`. All request and response bodies are JSON.

**Common rules**
- State-changing requests (`POST`, `PATCH`, `DELETE`) must send `Content-Type: application/json` and an `Origin` (or `Referer`) matching an allowed web origin.
- The session travels in the `vt_session` cookie (`__Host-vt_session` in production). Browsers must use `credentials: 'include'`.
- Every response carries `Cache-Control: no-store` and `X-Request-Id`.

## Error shape

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Try again later.",
    "fields": { "password": "Use at least 12 characters" },
    "retryAfter": 842,
    "scope": "account",
    "requestId": "5e61c3d4-6a54-4822-baf4-259b67dc072d"
  }
}
```

`fields`, `retryAfter` (seconds, also sent as a `Retry-After` header) and `scope` appear only when
relevant. Messages are safe for display but generic by design. The client chooses its own copy per code.

| Code | Status | Meaning |
|---|---|---|
| `VALIDATION_FAILED` | 400 | Invalid input; `fields` maps field → message. Also malformed JSON. |
| `INVALID_CREDENTIALS` | 401 | Wrong email or password (indistinguishable) |
| `UNAUTHENTICATED` | 401 | No valid session |
| `EMAIL_NOT_VERIFIED` | 403 | Correct credentials, email not verified yet |
| `FORBIDDEN` | 403 | Member lacks the permission |
| `CSRF_REJECTED` | 403 | Missing or foreign Origin on a state-changing request |
| `NOT_FOUND` | 404 | Unknown route, or an organization you are not a member of |
| `ALREADY_MEMBER`, `INVITATION_EXISTS`, `INVITATION_EMAIL_MISMATCH`, `LAST_OWNER` | 409 / 403 | Organization codes, see [../organization/api.md](../organization/api.md) |
| `TOKEN_EXPIRED` | 410 | Link expired |
| `TOKEN_INVALID` | 400 | Link unknown, malformed, already used or superseded |
| `PAYLOAD_TOO_LARGE` | 413 | Body over 10 KB |
| `UNSUPPORTED_MEDIA_TYPE` | 415 | Non-JSON body |
| `RATE_LIMITED` | 429 | `retryAfter` seconds; `scope`: `account` (this email) or `client` (this network) |
| `SERVER` | 500 | Unexpected error (details only in server logs, correlated by `requestId`) |

---

## `POST /auth/signup`

```json
{ "fullName": "Riley Chen", "email": "riley@northwind.dev", "workspace": "Northwind Security",
  "password": "…", "confirmPassword": "…" }
```

→ `202 { "email": "riley@northwind.dev", "verificationRequired": true }`

The response is identical whether or not the email already has an account.

- **New email:** creates the user, organization and owner membership, and emails a verification link (24 h).
- **Existing email:** creates nothing and emails the owner an "account exists" notice.
- **Rules:** name 2–80 characters; workspace 2–60; password 12–128 characters and must not contain the name or email local part.
- **Errors:** `VALIDATION_FAILED`, `RATE_LIMITED` (10 per hour per IP).

## `POST /auth/login`

```json
{ "email": "riley@northwind.dev", "password": "…", "remember": false }
```

→ `200` and `Set-Cookie`:

```json
{
  "user": { "id": "…", "fullName": "Riley Chen", "email": "riley@northwind.dev", "emailVerified": true },
  "organization": { "id": "…", "name": "Northwind Security", "slug": "northwind-security-1a2b3c" },
  "membership": { "role": "owner", "roleLabel": "Owner" },
  "memberships": [ { "organization": { "id": "…", "name": "…", "slug": "…" }, "role": "owner", "roleLabel": "Owner" } ],
  "session": { "persistent": false, "expiresAt": "2026-09-17T08:00:00.000Z" }
}
```

- **Errors:** `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED`, `RATE_LIMITED`.
- **Limits:** 30 attempts per 15 min per IP (`scope: client`); 5 failures per 15 min per email (`scope: account`). While locked, even the correct password gets `RATE_LIMITED`.

## `POST /auth/logout`

Body: none or `{}`. → `200 { "ok": true }`.

Deletes the current server session (if any) and clears the cookie. Idempotent.

## `GET /auth/session`

→ `200` with the same payload as login, or `401 UNAUTHENTICATED` (and a cleared cookie if one
was presented but is invalid).

## `POST /auth/email/verify`

`{ "token": "…" }` → `200 { "verified": true }`

- **Errors:** `TOKEN_EXPIRED`, `TOKEN_INVALID`, `RATE_LIMITED` (30 per 15 min per IP). Tokens are single-use.

## `POST /auth/email/resend`

`{ "email": "…" }` → `202 { "ok": true, "cooldown": 60 }`

The response is identical for unknown, verified and unverified emails. Only unverified accounts
receive a new link, and it invalidates earlier ones.

- **Errors:** `RATE_LIMITED`: 1 per 60 s and 5 per hour per email (`account`); 20 per hour per IP (`client`). Signup starts the 60 s cooldown.

## `POST /auth/password/forgot`

`{ "email": "…" }` → `202 { "ok": true }`

The response is always identical. Active accounts receive a 30-minute single-use link, which
invalidates earlier links.

- **Errors:** `RATE_LIMITED`: 3 per hour per email; 20 per hour per IP.

## `POST /auth/password/reset/validate`

`{ "token": "…" }` → `200 { "valid": true }`

Does **not** consume the token.

- **Errors:** `TOKEN_EXPIRED`, `TOKEN_INVALID`, `RATE_LIMITED`.

## `POST /auth/password/reset`

`{ "token": "…", "password": "…", "confirmPassword": "…" }` → `200 { "ok": true, "sessionsRevoked": true }`

- Signs out every session for the account and emails a "password changed" notice.
- Verifies the email if it wasn't verified yet.
- Lifts any login lockout.
- A policy violation returns `VALIDATION_FAILED` and leaves the token usable.

**Errors:** `VALIDATION_FAILED`, `TOKEN_EXPIRED`, `TOKEN_INVALID`, `RATE_LIMITED`.

---

## Organizations, members, invitations

Moved to [../organization/api.md](../organization/api.md) (Organization & RBAC phase). The login
and session payloads above gained two additive fields: a top-level `permissions` array for the
current organization and `current: true|false` on each `memberships` entry.

## `GET /health`

→ `200 { "status": "ok", "database": "up" }`, or `503` when the database is down.
