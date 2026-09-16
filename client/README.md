# VulnTrack — client

React + Vite (JavaScript) frontend. Current phase: **authentication UI/UX** with a mocked auth service.

```bash
npm install     # .npmrc sets legacy-peer-deps (R3F's optional React Native peers)
npm run dev     # http://localhost:5173 → /login
npm run build
npm run lint
```

Routes: `/login`, `/signup`, `/forgot-password`, `/reset-password?token=…`, `/verify-email?email=…|token=…`, `/session`.

In dev, use the **Preview states** button to trigger every auth state (mock scenarios are listed in
`docs/design-system/pages/auth.md`). Design rules: `docs/design-system/MASTER.md`.
