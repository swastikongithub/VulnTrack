import { useEffect, useState } from 'react'

/**
 * One-shot success messages travel in router state ({ flash }). The page reads
 * it once at mount, then clears it so a reload doesn't repeat the message.
 * Only the location seen at mount is cleared: a page that is still animating
 * out must not wipe the flash meant for the page replacing it.
 */
export function useClearFlashOnce(location, navigate) {
  const [mounted] = useState(location)
  useEffect(() => {
    if (mounted.state?.flash) navigate(`${mounted.pathname}${mounted.search}`, { replace: true, state: null })
  }, [mounted, navigate])
}
