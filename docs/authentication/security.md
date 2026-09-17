# Authentication — Security

This document records what is implemented, what was reviewed, and what remains. It is **not** a
claim that the system is "secure". The authentication layer has a reasonable baseline and still
needs hardening before handling real customer data (see the backlog).

## Controls implemented

| Area | Control |
|---|---|
| Password storage | Argon2id, m=19 MiB, t=2, p=1 (OWASP minimum), per-hash salt, PHC string. `passwordHash` excluded from queries by default. |
| Password policy | 12–128 characters, no name or email local part (NIST 800-63B style, no composition rules). Enforced on the server; the client mirrors it. Paste and password managers allowed. |
| Credential errors | One generic `INVALID_CREDENTIALS` for unknown email and wrong password. A dummy Argon2 verification equalizes timing for unknown accounts. |
| Account enumeration | Signup, resend verification and forgot password respond identically for existing and non-existing emails. Emails are sent asynchronously, so response time doesn't depend on delivery. Verification status is revealed only after a correct password. |
| Brute force | Mongo-backed fixed windows. Login: 30 per 15 min per IP; 5 failures per 15 min per email-fingerprint (applies to nonexistent accounts too; blocks even a correct password while locked). Signup, forgot, resend and token endpoints are limited as well. `Retry-After` is returned. |
| Sessions | Opaque 256-bit ids; only SHA-256 digests are stored. httpOnly, SameSite=Lax, Secure plus `__Host-` prefix in production. Absolute and idle expiry, rotation on login, revocation on logout, all sessions revoked on password reset, sessions older than `passwordChangedAt` rejected. See [session-strategy.md](./session-strategy.md). |
| CSRF | Exact Origin/Referer allowlist on all POSTs, SameSite=Lax, JSON-only bodies (415 otherwise), CORS credentials only for allowed origins. |
| One-time tokens | 256-bit random; SHA-256 digests stored; purpose-bound (a verification token can't reset a password). Atomic single-use consumption, expiry (verification 24 h, reset 30 min), superseded on reissue. Expired vs invalid are distinguished only for UX. |
| Token leakage | Tokens travel in POST bodies to the API, never API URLs. The SPA sets `Referrer-Policy: no-referrer`. The logger redacts `password`, `token`, `passwordHash`, `tokenHash`, cookies and authorization headers. The `log` email transport is refused outside development. |
| Input validation | zod schemas on every body. Unknown keys stripped; only primitives reach queries (blocks `{"$gt": ""}` operator injection). 10 KB body limit. `strictQuery`. Simple query parser. |
| Tenant isolation | Every organization route resolves `Membership(organizationId, userId)`. Non-members get 404 (no existence oracle); ids are validated. Roles are per membership. Permission checks are centralized in `config/roles.js`. Full RBAC controls: [../organization/security.md](../organization/security.md). |
| Transactions | Signup (user + org + owner membership + token) and password reset (consume token + change password + revoke sessions) are atomic. |
| Error handling | Structured codes, generic messages, no stack traces, `requestId` for correlation. Unexpected errors are logged server-side. |
| Headers | helmet defaults (nosniff, frameguard, HSTS in production via TLS terminator, etc.), `x-powered-by` off, `Cache-Control: no-store`. |
| Audit foundation | `auditlogs` records signup, login success/failure (with reason), logout, verification, resend, reset request and completion, with ip, user agent and request id. No raw emails for unknown subjects (HMAC fingerprint). |
| Secrets | No secrets in source. `.env` gitignored. Config validation rejects missing, short or placeholder secrets and unsafe production settings. |

## Security review (this phase)

| Item | Finding | Outcome |
|---|---|---|
| Password update via aggregation pipeline | PHC strings start with `$`, which a pipeline reads as a field path, silently wiping the hash | **Fixed** (`$literal`); covered by the reset tests |
| One-time verification tokens in React | StrictMode or remounts could POST twice and show a valid link as invalid | **Fixed**: per-token request de-duplication |
| Reset link check on network failure | The UI would have shown "invalid link" for an outage | **Fixed**: dedicated "unavailable" state with retry |
| Mock code in production | Design-preview mock and dev panel could ship | **Fixed**: dev-only dynamic import; verified absent from the production bundle |
| Stale mock session in web storage | Leftover `vt:mock-session` | **Fixed**: removed on load; real session state is never stored client-side |
| Operator injection | Global `sanitizeFilter` would also rewrite trusted operators | Mitigated at the boundary (typed schemas) instead; tested with `{ "$gt": "" }` |
| Cookie flags | Verified `HttpOnly; SameSite=Lax; Path=/`, persistent `Expires` only with remember, `__Host-`/Secure in production config | OK (tests) |
| Logs | Live run checked: no passwords, hashes or cookies in API logs. Dev email links (tokens) appear only with `EMAIL_TRANSPORT=log`, which production refuses. | OK |
| Authorization bypass | Cross-tenant reads, suspended membership, role-restricted member list, unauthenticated access | OK (tests + live check) |

## Assumptions

- The web app and API are deployed on the **same site** (SameSite=Lax cookies).
- TLS terminates in front of the API in production, and `TRUST_PROXY` is set correctly.
- MongoDB is a replica set, with network access restricted and auth enabled (Atlas defaults).
- Email addresses are identities after trim + lowercase. Provider-specific aliasing (dots, `+tags`) is treated as distinct.
- Account email ownership is established by clicking a link sent to that address.

## Known limitations

- **Unverified account pre-registration.** Someone can sign up with another person's email first. They can't use the account (login requires verification), and the real owner can take it over through password reset, which sets a password only they know and marks the email verified. However, if the owner clicks the *attacker-initiated* verification link, the attacker's password remains valid until the owner resets it. Unverified accounts aren't expired yet.
- **Minor timing differences remain**, e.g. the new-account signup transaction vs the existing-account path, and token issuance on resend for unverified accounts. Emails are already asynchronous.
- **Email delivery is fire-and-forget in process.** A crash can drop an email, and the user must use resend. A durable queue arrives with BullMQ.
- **Rate limiting uses fixed windows** with a small concurrency race (a burst can exceed a limit by about 1). IP limits can affect users behind shared NAT.
- **No session management UI:** no device list and no "sign out everywhere" outside password reset.
- **No MFA, no breached-password check, no account-level lockout notifications.**
- **Audit logs are append-only by convention** (no update path in code), not by database-level immutability. There's no retention policy.
- **No CAPTCHA** or bot-detection after repeated signups; only IP rate limits.
- **`GET /auth/session` is a DB read per request.** Fine at current scale.

## Hardening backlog (later phases)

1. **Security headers and TLS:** HSTS preload and a CSP for the web app host; verify helmet settings behind Railway.
2. **Breached-password screening:** k-anonymity HIBP range API, and optional deny-list of common passwords.
3. **MFA:** TOTP / WebAuthn passkeys for owners and admins first.
4. **Session management:** device list, revoke individual sessions, "sign out everywhere", re-authentication for sensitive actions.
5. **Unverified accounts:** expire and clean up after N days; invalidate the attacker-set password when a pre-registered account is claimed via verification.
6. **Durable jobs:** move email dispatch to BullMQ with retries; Redis-backed sliding-window rate limits.
7. **Detection and alerting:** notify users of new-device logins and lockouts; export audit events; alert on credential-stuffing patterns.
8. **Audit integrity:** restricted DB role (insert-only), retention policy, optional hash chaining.
9. **Dependencies:** `npm audit` and dependency updates in CI (GitHub Actions phase); secret scanning.
10. **Self-security tests** (plan §50) extended as RBAC and tenant features grow: IDOR tests for every new org-scoped route.
