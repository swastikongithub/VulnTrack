import { createStore } from '@/lib/createStore'

/**
 * Mock client session for the UI phase. The real implementation will rely on
 * server-issued secure, httpOnly cookies — the client will never hold tokens.
 * Here we only remember who "signed in" so the session hand-off screen and
 * route guard can be exercised. "Keep me signed in" → localStorage, else sessionStorage.
 */
const KEY = 'vt:mock-session'

function read() {
  try {
    const raw = window.localStorage.getItem(KEY) ?? window.sessionStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const sessionStore = createStore({ session: read(), signedOut: false, pendingSignup: null })

export const sessionActions = {
  establish(session) {
    try {
      const storage = session.persistent ? window.localStorage : window.sessionStorage
      storage.setItem(KEY, JSON.stringify(session))
    } catch {
      /* storage unavailable — keep in memory */
    }
    sessionStore.setState({ session, signedOut: false })
  },
  clear() {
    try {
      window.localStorage.removeItem(KEY)
      window.sessionStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
    sessionStore.setState({ session: null, signedOut: true })
  },
  acknowledgeSignOut() {
    sessionStore.setState({ signedOut: false })
  },
  setPendingSignup(pendingSignup) {
    sessionStore.setState({ pendingSignup })
  },
}

export const useSessionStore = sessionStore.useStore
