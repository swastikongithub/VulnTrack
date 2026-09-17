# Organizations & RBAC — Security

This records what is enforced, how it was verified, and what remains. It isn't a claim that
authorization is "secure". It is a tested baseline.

## Threats and controls

| Threat | Control | Verified by |
|---|---|---|
| Unauthenticated access | `requireAuth` on every organization route except `POST /invitations/inspect` | `organizationManagement.test.js` (10 endpoints → 401) |
| Cross-tenant reads/writes (IDOR) | Membership resolved for `(organizationId, userId)`; sub-resources queried *within* the organization | Management + invitation isolation tests (org, member and invitation id tampering → 404) |
| Organization-existence probing | Non-member, unknown and malformed ids → identical 404 | `organizations.test.js` |
| User-id tampering | Target membership looked up inside the resolved organization only | Cross-tenant tests; `aaaaaaaaaaaa` (12-char "valid ObjectId") rejected by strict id check |
| Vertical escalation (viewer → owner) | Permission gate + H2/H4/H5 | 7 escalation attempts → 403, roles unchanged, 7 audit failures |
| Horizontal escalation (admin → admin) | H4 | Test: admin can't demote or remove another admin |
| Self-escalation | H5 | Tests (viewer and admin → owner on self) |
| Role tampering via body | zod enum; only `role` read; target from URL | Test with `userId`, `organizationId`, `permissions` injected; `{ $ne }`, arrays, casing → 400 |
| Last owner removed / write skew | H5 + `rosterVersion` lock + in-transaction re-check + owner count assertion | Concurrent demote and remove tests; negative control showed 0 owners without the lock |
| Organization-id tampering in switching | Active membership required; session-only preference | `organizationSwitching.test.js` |
| Invitation token theft from DB | SHA-256 digests only | Test asserts raw token absent from document and API response |
| Invitation token reuse | Atomic pending → accepted | Reuse → `TOKEN_INVALID`; concurrent accepts → 1 membership |
| Expired links | `expiresAt` checked on inspect and accept | `TOKEN_EXPIRED` tests |
| Accepting for someone else's email | Verified session email must match | `INVITATION_EMAIL_MISMATCH` test; invitation remains usable |
| Arbitrary role via invitation | Role fixed at creation under H7; accept ignores body role | Tests |
| Stale authority (demoted inviter) | Revoke on demotion/removal (H9) + re-check at accept (H8) | Test covers both paths |
| Duplicate invitations | Partial unique index | Parallel create test |
| Invitation spam | Per-org create limit, per-invitation resend cooldown | Resend 429 test |
| CSRF on PATCH/DELETE | Existing Origin guard covers all non-safe methods; CORS allows PATCH/DELETE only for allowed origins | CSRF test for PATCH and DELETE |
| UI-only security | Capability flags are advisory; all checks server-side | Live browser run: crafted `fetch` calls as Admin and Developer → 403 |
| Open redirect via `next` | Allowlisted in-app paths only (`lib/safeRedirect.js`) | Code review; only `/invite?token=` and `/organization[/members\|/settings]` accepted |

## Audit events

| Action | Outcome | Extra fields |
|---|---|---|
| `organization.update` | success | `metadata.fields` |
| `organization.switch` | success / failure (`not_a_member`) | — |
| `organization.member.role_change` | success / failure (`self`, `outranked`, `role_not_assignable`, `last_owner`) | `targetUserId`, `metadata.role/previousRole` |
| `organization.member.remove` | success / failure | `targetUserId`, `metadata.previousRole` |
| `organization.invitation.create` | success / failure | `invitationId`, `subjectFingerprint` (keyed hash of email), `metadata.role` |
| `organization.invitation.resend` / `.revoke` | success / failure | `invitationId`, `metadata.role` |
| `organization.invitation.accept` | success / failure (`email_mismatch`, `already_member`, `inviter_authority_lost`, `token_invalid`, `token_expired`) | `invitationId` |
| `authorization.denied` | failure (`missing_permission`) | `metadata.permission/role`; recorded for denied state-changing requests |

Invitee emails are never stored raw in audit logs (HMAC fingerprint). Tokens, passwords and session
ids are never logged; the logger's existing redaction covers `*.token`. A live log review of the
end-to-end run found no passwords, cookies or token digests. Raw tokens appeared only in the
development `log` email transport, which production refuses.

## Tests

Test files and counts: see the phase report. Backend coverage includes the RBAC policy unit tests
(full matrix), management, invitations, switching, isolation and concurrency. All 53
authentication tests still pass. One existing assertion about the retired coarse `members:manage`
permission was updated to the split permissions.

## Assumptions

- Email ownership is established by verification. An invitation is bound to the address, not to a
  specific account.
- Admin is trusted to manage security analysts, developers and viewers, and to invite at those levels.
- Organization names are not secrets (shown to invitees).

## Known limitations

- **Invitee without an account** must sign up normally, which also creates a personal workspace.
- **Production email** (including invitations) depends on the unresolved Railway SMTP issue. The
  lifecycle works without delivery, but invitees won't receive links until it's fixed.
- **No "leave organization"** or ownership-transfer shortcut (transfer = promote, then be demoted).
- **No member suspension API** (the status exists and is honored).
- **Login always selects the oldest membership**; the last-used organization isn't remembered across logins.
- **Member and invitation lists cap at 500** without pagination.
- **Current-organization resolution is one or two indexed reads per request** (acceptable now; cache later with Redis).
- **Inspect and accept share the IP token bucket** with email verification and password reset. Heavy
  testing from one IP hits it (observed during the live run); real users are unlikely to.
- **Audit logs** are still append-only by convention, with no retention policy (as in the authentication phase).
- **Removing a member doesn't end their sessions**; it ends their access to that organization only
  (sessions remain valid for other organizations).
- **No re-authentication step** for sensitive actions like owner promotion; a confirmation dialog only.

## Extension points

- **New domains:** carry `organizationId`, mount under `/organizations/:organizationId/...` with
  `requireMembership()` + `requirePermission(...)`, and query by `req.organization._id`.
- **Row-level rules** (e.g. developers updating *assigned* findings): add a scoped permission and a
  policy function in the domain service, in the style of `organizationPolicy.js`.
- **Invitation-aware signup:** accept an invitation token at signup to skip workspace creation.
- **Remember last organization:** store a preference on the user, still re-validated per request.
- **SSO / SCIM:** would create or suspend memberships through the same model.
- **Session revocation on removal:** optional, if organization-scoped sessions become a requirement.
