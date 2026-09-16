import { useEffect } from 'react'
import { RouterProvider } from 'react-router'
import { MotionPreferenceProvider } from '@/design-system/motion/MotionPreferenceProvider'
import { SmoothScroll } from '@/design-system/motion/SmoothScroll'
import { sessionActions } from '@/features/auth/sessionStore'
import { router } from './router'

/** Application root: global providers wrap the router. */
export default function App() {
  // Ask the API who is signed in (the session cookie is httpOnly, so only the server knows).
  useEffect(() => {
    sessionActions.refresh()
  }, [])

  return (
    <MotionPreferenceProvider>
      <SmoothScroll />
      <RouterProvider router={router} />
    </MotionPreferenceProvider>
  )
}
