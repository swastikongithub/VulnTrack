# VulnTrack
VulnTrack is a cybersecurity vulnerability management platform for organizations to discover vulnerable assets, ingest CVE intelligence, assess and prioritize security risks, manage remediation, and track findings through verification and closure, with automated scanning, RBAC, audit logs, background jobs, analytics, and AI-assisted insights.

## Current status

- **Authentication:** complete end to end. The animated authentication UI (`client/`) runs on the real authentication API (`server/`) with MongoDB.
- **Asset management:** organization-scoped asset inventory (types, environment, criticality, exposure, lifecycle, typed identifiers, tags, ownership) with server-side search, filters and pagination; archive, restore and delete; audit (`/organization/assets`).
- **Software inventory:** per-asset software and dependency records (ecosystem, package, version, direct/transitive, runtime/development) with canonical identity (normalized package key, normalized version, Package URL), organization-wide search, filters and pagination, and audit (`/organization/software`).
- **Vulnerability intelligence:** a global, read-only catalogue of public advisories ingested from NVD and OSV through source adapters into one normalized model (CVSS, CWE, references, affected packages and CPE products, CISA known-exploited status), with ID and keyword search, filters and per-source freshness (`/organization/vulnerabilities`). Filled by an operator worker: `npm run vulns:sync` ([docs/vulnerabilities/ingestion.md](docs/vulnerabilities/ingestion.md)). Not yet matched against software inventory.
- **Organizations & RBAC:** multi-tenant organizations with a central permission model, owner/admin hierarchy, invitations, organization switching, and the members and settings screens (`/organization/*`, `/invite`).
- **Marketing page:** public landing page at `/` describing only shipped functionality, with a clearly labelled roadmap (see `docs/design-system/pages/marketing.md`).

## Run locally

```bash
docker compose up -d mongo                      # MongoDB replica set (127.0.0.1:27018)

cd server && cp .env.example .env               # set AUTH_SECRET (see .env.example)
npm install && npm run dev                      # API  → http://localhost:4000

cd ../client && npm install && npm run dev      # Web  → http://localhost:5173
```

In development, verification and password-reset emails are printed to the API terminal
(`EMAIL_TRANSPORT=log`).

The vulnerability catalogue starts empty. Fill it from the public sources, for example:

```bash
cd server
npm run vulns:sync -- --source osv --package npm:lodash        # one package's advisories
npm run vulns:sync -- --source nvd --since 2026-09-01          # recent CVEs (then run without --since to resume)
```

## Documentation

- `docs/cybersecurity-vulnerability-management-platform-master-plan.md` — product plan
- `docs/design-system/` — visual & interaction system (page rules in `docs/design-system/pages/`, including the landing page)
- `docs/authentication/` — auth architecture, session strategy, API, environment, security
- `docs/organization/` — organization model, RBAC matrix, invitations, API, security
- `docs/assets/` — asset model, lifecycle and identifiers, API, security
- `docs/software/` — software component model, canonical identity, API, security
- `docs/vulnerabilities/` — vulnerability model, ingestion worker and CLI, API, security
