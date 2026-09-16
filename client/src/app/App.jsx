import { Logo } from '@/design-system/components'
import { MotionPreferenceProvider } from '@/design-system/motion/MotionPreferenceProvider'
import { SmoothScroll } from '@/design-system/motion/SmoothScroll'

/**
 * Application root: global providers wrap the app content.
 * Auth routes are mounted here once the auth pages are implemented.
 */
export default function App() {
  return (
    <MotionPreferenceProvider>
      <SmoothScroll />
      <main className="grid min-h-dvh place-items-center bg-ink-950 px-6">
        <Logo />
      </main>
    </MotionPreferenceProvider>
  )
}
