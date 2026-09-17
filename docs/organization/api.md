# Organization API

Base path `/api`. Common rules, the error shape and the auth error codes are in
[../authentication/api.md](../authentication/api.md): JSON bodies, `Origin` required on
state-changing requests (`POST`, `PATCH`, `DELETE`), session cookie, `Cache-Control: no-store`,
`X-Request-Id`.

`:organizationId` is an organization id **or `current`** (the session's current organization).
Both forms go through the same membership check.

## Error codes added in this phase

| Code | Status | Meaning |
|---|---|---|
| `ALREADY_MEMBER` | 409 | The email/account already belongs to the organization |
| `INVITATION_EXISTS` | 409 | A pending invitation already exists for this email |
| `INVITATION_EMAIL_MISMATCH` | 403 | Signed-in account's email differs from the invited email |
| `LAST_OWNER` | 409 | The change would leave the organization without an owner |

Reused codes:
- `401 UNAUTHENTICATED`
- `403 FORBIDDEN`: missing permission or hierarchy rule; the message says which kind.
- `404 NOT_FOUND`: non-member, unknown or malformed id, or a sub-resource outside the organization.
- `400 VALIDATION_FAILED`
- `429 RATE_LIMITED`
- `400 TOKEN_INVALID` / `410 TOKEN_EXPIRED` for invitation links.

---

## Session payload (changed, additive)

`POST /auth/login`, `GET /auth/session`, `POST /organizations/switch` and `POST /invitations/accept`
return:

```json
{
  "user": { "id": "…", "fullName": "Riley Chen", "email": "riley@northwind.dev", "emailVerified": true },
  "organization": { "id": "…", "name": "Northwind", "slug": "northwind-1a2b3c" },
  "membership": { "role": "developer", "roleLabel": "Developer" },
  "permissions": ["assets:read", "findings:read", "organization:read", "vulnerabilities:read"],
  "memberships": [
    { "organization": { "id": "…", "name": "Riley Personal", "slug": "…" }, "role": "owner", "roleLabel": "Owner", "current": false },
    { "organization": { "id": "…", "name": "Northwind", "slug": "…" }, "role": "developer", "roleLabel": "Developer", "current": true }
  ],
  "session": { "persistent": false, "expiresAt": "…" }
}
```

`permissions` and `current` are new. `permissions` shapes the UI only.

## Organizations

### `GET /organizations`
→ `200 { memberships: [...] }` (the caller's active memberships, with `current`).

### `POST /organizations/switch`
`{ "organizationId": "…" }` → `200` session payload.
- `404` if the caller isn't an active member.
- `400` if the id isn't a string.

### `GET /organizations/:organizationId` — `organization:read`
```json
{
  "organization": { "id": "…", "name": "Northwind", "slug": "…", "createdAt": "…", "memberCount": 5 },
  "membership": { "role": "admin", "roleLabel": "Admin" },
  "permissions": ["…"],
  "assignableRoles": [{ "value": "security_analyst", "label": "Security Analyst" }, { "value": "developer", "label": "Developer" }, { "value": "viewer", "label": "Viewer" }]
}
```

### `PATCH /organizations/:organizationId` — `organization:update`
`{ "name": "Northwind Security" }` (2–60 characters, trimmed) → `200`, same shape as `GET`.
- Other fields (`slug`, `createdBy`, …) are ignored.

## Members

### `GET /organizations/:organizationId/members` — `members:read`
```json
{ "members": [{
  "userId": "…", "fullName": "Dev Developer", "email": "dev@northwind.dev",
  "role": "developer", "roleLabel": "Developer", "joinedAt": "…",
  "isCurrentUser": false,
  "actions": { "updateRole": true, "remove": true }
}] }
```
- `actions` are the hierarchy decisions for the caller.
- The list is capped at 500 (pagination later).

### `GET /organizations/:organizationId/members/:userId` — `members:read`
→ `200 { member }`, or `404` if that user isn't an active member of this organization.

### `PATCH /organizations/:organizationId/members/:userId` — `members:update_role`
`{ "role": "security_analyst" }` → `200 { member }`.
- `400` for an unknown role.
- `403` when a hierarchy rule forbids it: self, an equal or higher target, or a role the caller can't grant.
- `409 LAST_OWNER`.
- Setting the current role again is a no-op `200`.

### `DELETE /organizations/:organizationId/members/:userId` — `members:remove`
→ `200 { ok: true }`.
- `403`: self, or an equal or higher target.
- `409 LAST_OWNER`.
- Also revokes the removed member's pending invitations.

## Invitations (management)

### `GET /organizations/:organizationId/invitations` — `members:invite`
```json
{ "invitations": [{
  "id": "…", "email": "new.hire@northwind.dev", "role": "developer", "roleLabel": "Developer",
  "status": "pending", "expiresAt": "…", "createdAt": "…", "lastSentAt": "…",
  "invitedBy": { "id": "…", "fullName": "Olivia Owner" },
  "actions": { "resend": true, "revoke": true }
}] }
```
Includes pending invitations past expiry, with `status: "expired"`, so they can be resent.

### `POST /organizations/:organizationId/invitations` — `members:invite`
`{ "email": "new.hire@northwind.dev", "role": "developer" }` → `201 { invitation }`.
- **Errors:** `400` (invalid email or role), `403` (role not grantable), `409 ALREADY_MEMBER`, `409 INVITATION_EXISTS`, `429`.
- The token is emailed; it is never returned.

### `POST /organizations/:organizationId/invitations/:invitationId/resend` — `members:invite`
→ `200 { invitation }`.
- Issues a new token and a new 7-day expiry; the old link stops working.
- **Errors:** `403`, `404`, `429` (1/min, 5/h per invitation).

### `DELETE /organizations/:organizationId/invitations/:invitationId` — `members:invite`
→ `200 { ok: true }`.
- **Errors:** `403`, `404` (including already accepted or revoked, or another tenant's invitation).

## Invitations (invitee)

### `POST /invitations/inspect` (no session)
`{ "token": "…" }` → `200`:
```json
{ "invitation": { "email": "…", "role": "developer", "roleLabel": "Developer", "expiresAt": "…",
  "organization": { "id": "…", "name": "Northwind" }, "invitedBy": { "fullName": "Olivia Owner" } } }
```
- **Errors:** `400 TOKEN_INVALID`, `410 TOKEN_EXPIRED`, `429`.
- Doesn't consume the token.

### `POST /invitations/accept` (session required)
`{ "token": "…" }` → `200` session payload; the invited organization is now `current`.
- **Errors:**
  - `401`
  - `400 TOKEN_INVALID` (unknown, used, revoked, superseded, or inviter lost authority)
  - `410 TOKEN_EXPIRED`
  - `403 INVITATION_EMAIL_MISMATCH`
  - `409 ALREADY_MEMBER`
  - `429`
- Extra body fields (`role`, `organizationId`) are ignored.
