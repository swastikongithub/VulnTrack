import { createStore } from '@/lib/createStore'
import { getSession } from '@/services/auth/authService'

/**
 * Client view of the authenticated session. The server is the source of truth:
 * the session itself lives in an httpOnly cookie the browser script cannot
 * read, and nothing about it is persisted in web storage. On load the app asks
 * the API who is signed in (GET /auth/session).
 *
 * status: 'unknown' (not checked yet) | 'authenticated' | 'anonymous'
 */
export const sessionStore = createStore({
  status: 'unknown',
  /** { user, organization, membership, memberships, session } from the API */
  session: null,
  signedOut: false,
})

// The UI-phase mock kept a fake session in web storage; remove any leftover.
try {
  window.localStorage.removeItem('vt:mock-session')
  window.sessionStorage.removeItem('vt:mock-session')
} catch {
  /* storage unavailable */
}

let refreshing = null

export const sessionActions = {
  /** Resolves the current session from the API. Concurrent calls share one request. */
  refresh() {
    refreshing ??= getSession()
      .then((session) => sessionStore.setState({ status: session ? 'authenticated' : 'anonymous', session }))
      .catch(() => sessionStore.setState({ status: 'anonymous', session: null }))
      .finally(() => {
        refreshing = null
      })
    return refreshing
  },
  /** Called with the login response once the hand-off sequence completes. */
  establish(session) {
    sessionStore.setState({ status: 'authenticated', session, signedOut: false })
  },
  clear() {
    sessionStore.setState({ status: 'anonymous', session: null, signedOut: true })
  },
  acknowledgeSignOut() {
    sessionStore.setState({ signedOut: false })
  },
}

export const useSessionStore = sessionStore.useStore
