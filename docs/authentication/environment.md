# Environment & local setup

## API (`server/.env`, template `server/.env.example`)

The process validates everything at startup and refuses to run with missing or unsafe values.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `NODE_ENV` | | `development` | `development` \| `test` \| `production` |
| `PORT` | | `4000` | |
| `MONGODB_URI` | ✔ | — | Must point at a **replica set** (transactions). Atlas clusters qualify. |
| `APP_ORIGIN` | ✔ | — | Web app origin. Used for email links and the CSRF origin check. Must be `https` in production. |
| `ALLOWED_ORIGINS` | | — | Extra allowed web origins, comma-separated |
| `AUTH_SECRET` | ✔ | — | ≥32 random characters. HMAC key for rate-limit keys and audit fingerprints. Placeholder-looking values are rejected in production. |
| `TRUST_PROXY` | | `0` | Reverse-proxy hops in front of the API. **Set to `1` on Railway**, or every client appears to share the proxy's IP for rate limiting. |
| `COOKIE_SECURE` | | `true` in production | Cannot be `false` in production |
| `COOKIE_SAMESITE` | | `lax` | `lax` \| `strict` (cross-site `none` is intentionally unsupported) |
| `SESSION_TTL_HOURS` | | `12` | Absolute lifetime of a normal session |
| `SESSION_REMEMBER_DAYS` | | `30` | Absolute lifetime with "Keep me signed in" |
| `EMAIL_TRANSPORT` | | `log` | `log` (dev only: prints links to the server log) \| `smtp`. Production requires `smtp`. |
| `EMAIL_FROM` | | `VulnTrack <no-reply@vulntrack.local>` | |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` | when `smtp` | port `587` | Any SMTP provider |
| `LOG_LEVEL` | | `info` | |
| `LOG_PRETTY` | | `false` | Human-readable logs (development) |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## Web client (`client/.env.local`, template `client/.env.example`)

| Variable | Default | Notes |
|---|---|---|
| `VITE_API_BASE_URL` | `/api` | Set for deployments where the API is on another host **of the same site** |
| `VITE_API_PROXY_TARGET` | `http://localhost:4000` | Dev proxy target for `/api` |
| `VITE_AUTH_MODE` | `api` | `mock` = design-preview mock (development builds only) |

## Local development

```bash
# 1. Infrastructure: MongoDB single-node replica set on 127.0.0.1:27018
docker compose up -d mongo
#    Optional real inbox (SMTP 1025, UI http://localhost:8025):
docker compose --profile mail up -d mailpit

# 2. API
cd server
cp .env.example .env          # then set AUTH_SECRET
npm install
npm run dev                   # http://localhost:4000/api/health

# 3. Web app
cd ../client
npm install
npm run dev                   # http://localhost:5173 (proxies /api to :4000)
```

With `EMAIL_TRANSPORT=log`, verification and reset links appear in the API's terminal. To use
Mailpit instead, set `EMAIL_TRANSPORT=smtp`, `SMTP_HOST=127.0.0.1` and `SMTP_PORT=1025`.

**Two local stacks at once:** browsers share cookies across ports on `localhost`, so two VulnTrack
instances (e.g. web `:5173` and `:5174`) overwrite and clear each other's session cookie. Serve the
second one on `127.0.0.1` (`vite --host 127.0.0.1`, `APP_ORIGIN=http://127.0.0.1:<port>`).

Host port 27018 avoids clashing with a locally installed MongoDB on 27017. Override it with
`MONGO_HOST_PORT` and change `MONGODB_URI` to match.

## Tests

```bash
cd server && npm test     # starts an in-memory MongoDB replica set; no Docker needed
```

## Deployment notes (Railway + MongoDB Atlas, later phase)

- `NODE_ENV=production`, `TRUST_PROXY=1`, `APP_ORIGIN=https://<web app>`, SMTP settings, and a unique `AUTH_SECRET`.
- Serve the web app and API on the **same site**. See [session-strategy.md](./session-strategy.md).
