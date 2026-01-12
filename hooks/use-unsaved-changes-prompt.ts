import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter, usePathname } from "next/navigation"

type UnsavedPrompt = {
  isOpen: boolean
  confirmNavigation: () => void
  stayOnPage: () => void
}

const HISTORY_BACK = "__history-back"

// Shows a confirmation modal and blocks in-app link navigation and browser back
// when `enabled` is true. External links and modifier clicks are ignored.
export function useUnsavedChangesPrompt(enabled: boolean): UnsavedPrompt {
  const router = useRouter()
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const pendingHrefRef = useRef<string | null>(null)
  const allowNavigationRef = useRef(false)

  const resetPrompt = useCallback(() => {
    allowNavigationRef.current = false
    pendingHrefRef.current = null
    setIsOpen(false)
  }, [])

  const stayOnPage = useCallback(() => {
    resetPrompt()
  }, [resetPrompt])

  const confirmNavigation = useCallback(() => {
    allowNavigationRef.current = true
    const target = pendingHrefRef.current
    resetPrompt()

    if (target === HISTORY_BACK) {
      router.back()
      return
    }

    if (target) {
      router.push(target)
    }
  }, [resetPrompt, router])

  // Intercept in-app anchor clicks
  useEffect(() => {
    if (!enabled) return

    const handleClick = (event: MouseEvent) => {
      if (!enabled) return

      const target = event.target as HTMLElement | null
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null
      if (!anchor) return

      // Ignore modified clicks or new tabs
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return

      const href = anchor.getAttribute("href")
      if (!href) return
      if (href.startsWith("#")) return

      const url = new URL(href, window.location.href)
      if (url.origin !== window.location.origin) return

      const nextPath = url.pathname + url.search + url.hash
      if (nextPath === pathname) return

      event.preventDefault()
      pendingHrefRef.current = nextPath
      setIsOpen(true)
    }

    window.addEventListener("click", handleClick)
    return () => window.removeEventListener("click", handleClick)
  }, [enabled, pathname])

  // Intercept browser back/forward
  useEffect(() => {
    if (!enabled) return

    const handlePopState = () => {
      if (allowNavigationRef.current) return
      pendingHrefRef.current = HISTORY_BACK
      setIsOpen(true)
      // Push current route back to maintain URL until user confirms
      history.pushState(null, "", pathname)
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [enabled, pathname])

  // Warn when closing the tab or hard navigating away
  useEffect(() => {
    if (!enabled) return

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ""
      return ""
    }

    window.addEventListener("beforeunload", handleBeforeUnload)
    return () => window.removeEventListener("beforeunload", handleBeforeUnload)
  }, [enabled])

  return { isOpen, confirmNavigation, stayOnPage }
}
