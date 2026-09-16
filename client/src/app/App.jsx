import { RouterProvider } from 'react-router'
import { MotionPreferenceProvider } from '@/design-system/motion/MotionPreferenceProvider'
import { SmoothScroll } from '@/design-system/motion/SmoothScroll'
import { router } from './router'

/** Application root: global providers wrap the router. */
export default function App() {
  return (
    <MotionPreferenceProvider>
      <SmoothScroll />
      <RouterProvider router={router} />
    </MotionPreferenceProvider>
  )
}
