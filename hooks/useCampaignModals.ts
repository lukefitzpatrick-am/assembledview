"use client"

import { useCallback, useState } from "react"

export function useCampaignModals() {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [exportOpen, setExportOpen] = useState(false)

  const openDetails = useCallback(() => setDetailsOpen(true), [])
  const closeDetails = useCallback(() => setDetailsOpen(false), [])
  const toggleDetails = useCallback(() => setDetailsOpen((prev) => !prev), [])

  const openExport = useCallback(() => setExportOpen(true), [])
  const closeExport = useCallback(() => setExportOpen(false), [])
  const toggleExport = useCallback(() => setExportOpen((prev) => !prev), [])

  const closeAll = useCallback(() => {
    setDetailsOpen(false)
    setExportOpen(false)
  }, [])

  return {
    detailsOpen,
    exportOpen,
    setDetailsOpen,
    setExportOpen,
    openDetails,
    closeDetails,
    toggleDetails,
    openExport,
    closeExport,
    toggleExport,
    closeAll,
  }
}
