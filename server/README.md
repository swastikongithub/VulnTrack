# VulnTrack — API

Node.js + Express + MongoDB (Mongoose). Current scope: authentication, sessions, email verification,
password recovery, organizations, RBAC, invitations, organization switching and the asset inventory.

```bash
docker compose up -d mongo     # from the repo root — MongoDB replica set on :27018
cp .env.example .env           # set AUTH_SECRET
npm install
npm run dev                    # http://localhost:4000/api/health
npm test                       # in-memory MongoDB replica set, no Docker needed
npm run lint
```

Docs: `docs/authentication/` (architecture, sessions, API, environment, security) and
`docs/organization/` (organization model, RBAC, invitations, API, security) and `docs/assets/`
(asset model, API, security).
