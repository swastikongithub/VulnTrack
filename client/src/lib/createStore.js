import { useSyncExternalStore } from 'react'

/**
 * Minimal external store. Lets non-React consumers (the WebGL render loop)
 * read state every frame without triggering React renders, while React
 * components can still subscribe to selected slices.
 */
export function createStore(initialState) {
  let state = initialState
  const listeners = new Set()

  const getState = () => state

  const setState = (partial) => {
    const next = typeof partial === 'function' ? partial(state) : partial
    let changed = false
    for (const key in next) {
      if (!Object.is(state[key], next[key])) {
        changed = true
        break
      }
    }
    if (!changed) return
    state = { ...state, ...next }
    listeners.forEach((listener) => listener(state))
  }

  const subscribe = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  function useStore(selector = (s) => s) {
    return useSyncExternalStore(
      subscribe,
      () => selector(state),
      () => selector(initialState),
    )
  }

  return { getState, setState, subscribe, useStore }
}
