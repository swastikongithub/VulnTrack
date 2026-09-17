# VulnTrack
VulnTrack is a cybersecurity vulnerability management platform for organizations to discover vulnerable assets, ingest CVE intelligence, assess and prioritize security risks, manage remediation, and track findings through verification and closure, with automated scanning, RBAC, audit logs, background jobs, analytics, and AI-assisted insights.

## Current status

- **Authentication:** complete end to end. The animated authentication UI (`client/`) runs on the real authentication API (`server/`) with MongoDB.
- **Organizations & RBAC:** multi-tenant organizations with a central permission model, owner/admin hierarchy, invitations, organization switching, and the members and settings screens (`/organization/*`, `/invite`).

## Run locally

```bash
docker compose up -d mongo                      # MongoDB replica set (127.0.0.1:27018)

cd server && cp .env.example .env               # set AUTH_SECRET (see .env.example)
npm install && npm run dev                      # API  → http://localhost:4000

cd ../client && npm install && npm run dev      # Web  → http://localhost:5173
```

In development, verification and password-reset emails are printed to the API terminal
(`EMAIL_TRANSPORT=log`).

## Documentation

- `docs/cybersecurity-vulnerability-management-platform-master-plan.md` — product plan
- `docs/design-system/` — visual & interaction system
- `docs/authentication/` — auth architecture, session strategy, API, environment, security
- `docs/organization/` — organization model, RBAC matrix, invitations, API, security
