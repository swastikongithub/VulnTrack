# RBAC

Two layers, both server-side:

1. **Permissions** (`server/src/config/roles.js`): *may this role perform this kind of action?*
   Checked by `requirePermission(permission)` before a controller runs.
2. **Hierarchy** (`server/src/services/organizationPolicy.js`): *may this member act on that member
   / grant that role?* Checked by the member and invitation services, and exposed to the UI as
   capability flags computed by the same functions.

Code never compares role names to decide access; it checks permissions. Rank is used only for
hierarchy.

## Roles

| Role (stored) | Label | Rank |
|---|---|---|
| `owner` | Owner | 50 |
| `admin` | Admin | 40 |
| `security_analyst` | Security Analyst | 30 |
| `developer` | Developer | 20 |
| `viewer` | Viewer | 10 |

## Permission matrix

Naming follows the existing `resource:action` convention (`organization.read` in the phase brief =
`organization:read` here).

| Permission | Owner | Admin | Security Analyst | Developer | Viewer | Used by |
|---|:-:|:-:|:-:|:-:|:-:|---|
| `organization:read` | ✔ | ✔ | ✔ | ✔ | ✔ | `GET /organizations/:id` |
| `organization:update` | ✔ | ✔ | | | | `PATCH /organizations/:id` |
| `members:read` | ✔ | ✔ | ✔ | | | member list / detail |
| `members:invite` | ✔ | ✔ | | | | invitations: list, create, resend, revoke |
| `members:update_role` | ✔ | ✔ | | | | `PATCH …/members/:userId` |
| `members:remove` | ✔ | ✔ | | | | `DELETE …/members/:userId` |
| `assets:read` | ✔ | ✔ | ✔ | ✔ | ✔ | *reserved* |
| `assets:create` | ✔ | ✔ | ✔ | | | *reserved* |
| `assets:update` | ✔ | ✔ | ✔ | | | *reserved* |
| `assets:delete` | ✔ | ✔ | | | | *reserved* |
| `vulnerabilities:read` | ✔ | ✔ | ✔ | ✔ | ✔ | *reserved* |
| `findings:read` | ✔ | ✔ | ✔ | ✔ | ✔ | *reserved* |
| `findings:create` | ✔ | ✔ | ✔ | | | *reserved* |
| `findings:update` | ✔ | ✔ | ✔ | | | *reserved* |
| `remediation:manage` | ✔ | ✔ | ✔ | | | *reserved* |
| `scans:run` | ✔ | ✔ | ✔ | | | *reserved* |

Decisions behind the matrix (refining master plan §5.10):

- **Default deny.** A permission with no grant for a role is denied; unknown roles and permissions are denied.
- **Analysts can see members but not manage them.** They need to know who is on the team to assign
  work later, but access control stays with owners/admins.
- **Developers and viewers can't list members.** The plan gives them "None" for Users.
- **Developers don't get `findings:update`.** The plan says developers update *assigned* findings. A
  blanket grant would be too broad, so the findings phase adds a row-scoped permission instead.
- **Reserved permissions have no endpoints.** They exist so the matrix is reviewed as a whole.
- The module throws at startup if a permission lacks a grant entry or a grant names an unknown role
  or permission.

**Adding a permission:** add it to `PERMISSIONS`, add one line to `GRANTS`, and put
`requirePermission(PERMISSIONS.X)` on the route. No middleware changes.

## Hierarchy rules

| # | Rule | Enforced in | Denial |
|---|---|---|---|
| H1 | Owners may grant any role, including `owner`. | `assignableRoles` | — |
| H2 | Everyone else may grant only roles **strictly below** their own (admin → analyst, developer, viewer). | `assignableRoles` / `canAssignRole` | 403 `FORBIDDEN` "You can't assign that role." |
| H3 | Owners may manage any *other* member (including other owners). | `decideMemberAction` | — |
| H4 | Others may manage only members **strictly below** their role (admin can't touch owners or other admins). | `decideMemberAction` | 403 "You can only manage members whose role is below yours." |
| H5 | Nobody changes their own role or removes themselves. | `decideMemberAction` | 403 "You can't change your own membership here." |
| H6 | At least one active owner always remains. | `memberService` (transaction) | 409 `LAST_OWNER` |
| H7 | Invitations can be created, resent or revoked only for roles the actor can grant (H1/H2). | `decideInvitation` | 403 |
| H8 | Acceptance re-checks the inviter still holds `members:invite` and can grant the role. | `invitationService.accept` | 400 `TOKEN_INVALID` (invitation revoked) |
| H9 | Demoting or removing a member revokes their pending invitations beyond their new authority. | `memberService` (same transaction) | — |

### Owner protection

Given H5, an owner can only be demoted or removed by *another* owner, so after any single change
the acting owner remains. The failure mode is concurrency: two owners demoting each other at the
same moment. Under MongoDB snapshot isolation both transactions could see the other as still an
owner and both commit (write skew), leaving zero owners.

Defense:
1. Each roster transaction increments `Organization.rosterVersion`, so concurrent transactions
   write the same document. One gets a write conflict and the driver retries it.
2. Inside the transaction, both the actor's and target's memberships are re-read and the policy is
   re-evaluated. After the retry, the demoted actor is no longer an owner → 403.
3. As defense in depth, the owner count is asserted after the write (`LAST_OWNER`).

This was verified with a negative control: with step 1 disabled, the concurrent test ended with
**0 owners** in 3 of 3 runs; with it enabled, one request succeeds and one gets 403, leaving 1
owner.

### Ownership model

Multiple owners are allowed, and there is always at least one. Handing over ownership means: an
owner promotes someone to owner, then the new owner changes the previous owner's role (H5 prevents
self-demotion). There is no "leave organization" action yet.

## Authorization decisions by endpoint

| Endpoint | Auth | Membership | Permission | Hierarchy / other |
|---|---|---|---|---|
| `GET /organizations` | ✔ | — (own memberships only) | — | — |
| `POST /organizations/switch` | ✔ | active membership in target (404) | — | — |
| `GET /organizations/:id` | ✔ | ✔ | `organization:read` | — |
| `PATCH /organizations/:id` | ✔ | ✔ | `organization:update` | only `name` accepted |
| `GET …/members` | ✔ | ✔ | `members:read` | row `actions` from H3–H5 |
| `GET …/members/:userId` | ✔ | ✔ | `members:read` | target scoped to org (404) |
| `PATCH …/members/:userId` | ✔ | ✔ | `members:update_role` | H2, H4, H5, H6, H9 |
| `DELETE …/members/:userId` | ✔ | ✔ | `members:remove` | H4, H5, H6, H9 |
| `GET …/invitations` | ✔ | ✔ | `members:invite` | row `actions` from H7 |
| `POST …/invitations` | ✔ | ✔ | `members:invite` | H7, not already a member, one pending per email, rate limit |
| `POST …/invitations/:id/resend` | ✔ | ✔ | `members:invite` | H7, scoped to org (404), cooldown |
| `DELETE …/invitations/:id` | ✔ | ✔ | `members:invite` | H7, scoped to org (404) |
| `POST /invitations/inspect` | — | — | — | valid token only |
| `POST /invitations/accept` | ✔ | — | — | email match, not a member, H8, single use |
