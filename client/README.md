# VulnTrack — client

React + Vite (JavaScript) web app. Current scope: the authentication experience, backed by the real API in `../server`.

```bash
npm install     # .npmrc sets legacy-peer-deps (R3F's optional React Native peers)
npm run dev     # http://localhost:5173 → /login  (proxies /api to http://localhost:4000)
npm run build
npm run lint
```

Start the API first (see `docs/authentication/environment.md`). Routes: `/login`, `/signup`,
`/forgot-password`, `/reset-password?token=…`, `/verify-email?email=…|token=…`, `/session`.

- Auth service facade: `src/services/auth/authService.js` (real API by default).
- `VITE_AUTH_MODE=mock` (development only) previews every UI state without a backend.
- Design rules: `docs/design-system/MASTER.md`. Auth architecture: `docs/authentication/README.md`.
