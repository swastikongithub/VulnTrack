# VulnTrack — API

Node.js + Express + MongoDB (Mongoose). Current scope: authentication, sessions, email verification,
password recovery and the organization/RBAC foundation.

```bash
docker compose up -d mongo     # from the repo root — MongoDB replica set on :27018
cp .env.example .env           # set AUTH_SECRET
npm install
npm run dev                    # http://localhost:4000/api/health
npm test                       # in-memory MongoDB replica set, no Docker needed
npm run lint
```

Docs: `docs/authentication/` — architecture, session strategy, API contract, environment, security.
