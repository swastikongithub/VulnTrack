# Organization model

## Collections

| Collection | Fields (security-relevant) | Indexes / constraints |
|---|---|---|
| `organizations` | `name` (2–60), `slug` (immutable), `createdBy`, `rosterVersion` | `slug` unique |
| `memberships` | `organizationId`, `userId`, `role`, `status: active \| suspended` | `(organizationId, userId)` unique; `(userId, createdAt)` |
| `invitations` | see [invitations.md](./invitations.md) | `tokenHash` unique; one pending per `(organizationId, emailNormalized)` (partial unique); `(organizationId, status, createdAt)`; `(invitedBy, status)`; TTL `purgeAt` |
| `sessions` | `activeOrganizationId` (preference only) | unchanged |
| `auditlogs` | + `targetUserId`, `invitationId`, `metadata { role, previousRole, permission, fields }` | unchanged |

**Membership is the only authorization state.** There is no role on the user, no role or
organization claim in the cookie, and no cached permission list in the database. Permissions are
computed from `membership.role` at request time, so a role change or removal takes effect on the
member's next request.

`Organization.rosterVersion` is not security state. Every role change or removal increments it
inside its transaction, which makes concurrent roster transactions conflict and retry serially (see
[rbac.md → Owner protection](./rbac.md#owner-protection)).

## Organization boundaries

- Every organization-scoped query filters by the organization id resolved from the membership
  (`req.organization._id`), never by a body or query value.
- Sub-resources are looked up **within** that organization: `Membership.findOne({ organizationId, userId })`,
  `Invitation.findOne({ _id, organizationId })`. An id from another tenant is simply not found (404).
- Non-member, nonexistent and malformed organization ids return the same 404 body.
- Future tenant-owned collections must carry `organizationId`, index it first, and be reached only
  through `requireMembership` + `requirePermission`.

## Current organization

A session stores `activeOrganizationId`, a **preference**, not a grant.

Resolution (`resolveActiveMembership`, used by `/organizations/current/**` and mirrored by `GET /auth/session`):

1. If the preferred organization has an active membership for the user → use it.
2. Otherwise use the oldest active membership, and write it back to the session.
3. No active memberships → `404` on `current` routes; the session payload has
   `organization: null, membership: null, permissions: []`.

Login sets the preference to the oldest membership (unchanged from the authentication phase).

## Switching

`POST /organizations/switch { organizationId }`:

- Validates the id shape, then requires an **active** membership in that organization (else 404,
  audited as `organization.switch` failure `not_a_member`).
- Updates only the calling session (`Session.activeOrganizationId`). Other devices keep their own
  current organization.
- Returns the refreshed session payload (organization, role, permissions, memberships with `current`).

This isn't a JWT claim. The id is re-validated on every request, so switching into an
organization never grants anything by itself.

## Member removal and suspension

- Removal deletes the membership (the audit log keeps the record). The unique index then allows a
  future re-invitation.
- The removed user's sessions stay valid for their other organizations; `current` falls back
  automatically.
- `status: suspended` memberships are ignored everywhere (reads, switching, management, member
  lists). No API sets suspension yet (reserved for offboarding / SSO later).
