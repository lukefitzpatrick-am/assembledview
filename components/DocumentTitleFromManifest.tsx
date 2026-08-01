"use client"

import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { resolveDocumentTitle } from "@/lib/nav/routeManifest"

/** Keeps `document.title` aligned with the route manifest for client-heavy pages. */
export function DocumentTitleFromManifest() {
  const pathname = usePathname() ?? "/"

  useEffect(() => {
    document.title = resolveDocumentTitle(pathname)
  }, [pathname])

  return null
}
