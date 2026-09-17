# Invitations

## Lifecycle

```
            create (owner/admin, role ≤ own authority)
                │
                ▼
   ┌────────► pending ──── accept (matching verified account) ───► accepted  (membership created)
   │            │  │
 resend         │  └── revoke (owner/admin) / inviter lost authority ──► revoked
 (new token,    │
  new expiry)   └── expiresAt passes ──► reported "expired"; flipped to `expired`
   └────────────┘                         when a new invitation replaces it
```

| Status | Usable | Listed as pending | Can resend |
|---|---|---|---|
| `pending` (not expired) | ✔ | ✔ | ✔ |
| `pending` past `expiresAt` | ✘ `TOKEN_EXPIRED` | ✔ (status `expired`) | ✔ (renews) |
| `accepted` / `revoked` / `expired` | ✘ `TOKEN_INVALID` | ✘ | ✘ |

Records are purged (TTL) 30 days after expiry. The audit log keeps the history.

## Model (`invitations`)

| Field | Notes |
|---|---|
| `organizationId` | The tenant; every management query is scoped by it |
| `email`, `emailNormalized` | Display value and lower-cased identity |
| `role` | Fixed at creation by someone allowed to grant it; never read from the accept request |
| `tokenHash` | SHA-256 of the token. **The raw token is never stored or logged** (only emailed) |
| `status` | `pending \| accepted \| revoked \| expired` |
| `expiresAt` | 7 days after creation or last resend |
| `invitedBy`, `lastSentAt`, `sendCount` | Resend bookkeeping; inviter authority is re-checked at acceptance |
| `acceptedAt/By`, `revokedAt/By` | `revokedBy: null` = revoked by the system (inviter lost authority) |
| `purgeAt` | TTL deletion |

Uniqueness: a partial unique index on `(organizationId, emailNormalized)` where `status: 'pending'`
guarantees one pending invitation per address, even under concurrent creates (verified: 3 parallel
creates → 201, 409, 409).

## Tokens

The same pattern as email-verification and password-reset tokens (`utils/crypto.js`):

- 256-bit random, base64url, sent only in the email link `APP_ORIGIN/invite?token=…`.
- Stored as a SHA-256 digest, looked up by digest.
- Resend replaces the digest, so older links stop working.
- Consumption is one atomic `findOneAndUpdate` (`pending → accepted` while unexpired). Two concurrent
  accepts produce one membership.
- Tokens travel to the API in POST bodies. The SPA sends `Referrer-Policy: no-referrer`, and the
  logger redacts `*.token`.

`AuthToken` isn't reused because it requires a `userId`, and invitees may not have an account yet.

## Acceptance rules (`POST /invitations/accept`)

Checks run in this order:
1. IP rate limit (shared token bucket).
2. The token must be usable: invalid → 400 `TOKEN_INVALID`; expired → 410 `TOKEN_EXPIRED`.
3. **Signed-in account's email must equal the invited email** (normalized). Otherwise
   403 `INVITATION_EMAIL_MISMATCH`, and the invitation stays usable for the right person. Sessions
   exist only for verified emails, so the invitee has proven control of that inbox.
4. Not already a member (active or suspended) → otherwise 409 `ALREADY_MEMBER`. A suspended member
   can't use an invitation to reactivate themselves.
5. Inviter still active and still allowed to grant the role; otherwise the invitation is revoked
   and the response is 400 `TOKEN_INVALID`.
6. One transaction: consume the token, create the membership with the invitation's role, and set the
   session's current organization to it.

**Deliberate account handling for a different email:** the UI shows who is signed in and who
was invited, and offers "Sign out and switch account", which returns to the same link after
sign-in (`/login?next=/invite?token=…`, allowlisted).

## Inspect (`POST /invitations/inspect`)

Public (no session) and non-consuming. Returns organization name/id, role, invited email, expiry
and inviter name. The token holder is the email recipient, so this discloses nothing they weren't
already sent. It does not reveal whether an account exists for the email.

## Email delivery

Invitations are dispatched through the existing email service (`EMAIL_TRANSPORT=smtp|log`), fire
and forget. **The lifecycle does not depend on delivery:**
- Creating an invitation succeeds even if SMTP fails; the failure is logged, and admins can resend.
- Tests use the in-memory transport and read tokens from the outbox; no network.
- Locally, `EMAIL_TRANSPORT=log` prints the link in the API terminal.

Known constraint: production SMTP from Railway is currently unresolved, so emails (verification,
reset, invitations) may not arrive in production until that is fixed. See [security.md](./security.md).

## Accounts that don't exist yet

Signup is unchanged (it always creates a workspace). An invitee without an account:
1. creates an account with the invited email (which also creates their own workspace);
2. verifies the email;
3. opens the invitation link again and accepts.

An invitation-aware signup that skips workspace creation is deferred (see [security.md](./security.md)).

## Limits

| Action | Limit |
|---|---|
| Create | 50 per hour per organization |
| Resend | 1 per minute and 5 per hour per invitation |
| Inspect / accept | 30 per 15 minutes per IP (shared with the email verification and reset token endpoints) |
