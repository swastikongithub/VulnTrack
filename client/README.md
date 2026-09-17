# VulnTrack — client

React + Vite (JavaScript) web app. Current scope: the authentication experience and the organization area (members, invitations, settings, switching), backed by the real API in `../server`.

```bash
npm install     # .npmrc sets legacy-peer-deps (R3F's optional React Native peers)
npm run dev     # http://localhost:5173 → /login  (proxies /api to http://localhost:4000)
npm run build
npm run lint
```

Start the API first (see `docs/authentication/environment.md`). Routes: `/login`, `/signup`,
`/forgot-password`, `/reset-password?token=…`, `/verify-email?email=…|token=…`, `/session`,
`/invite?token=…`, `/organization/members`, `/organization/settings`.

- Auth service facade: `src/services/auth/authService.js` (real API by default).
- `VITE_AUTH_MODE=mock` (development only) previews every auth UI state without a backend. The organization area always needs the API.
- Organization API client: `src/services/organization/organizationApi.js`. Docs: `docs/organization/README.md`.
- Design rules: `docs/design-system/MASTER.md`. Auth architecture: `docs/authentication/README.md`.
