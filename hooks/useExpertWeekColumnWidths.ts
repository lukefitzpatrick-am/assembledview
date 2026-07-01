import * as React from "react"

export function useExpertWeekColumnWidths() {
  const [weekColumnWidths, setWidths] = React.useState<Record<string, number>>({})
  const setWeekColumnWidth = React.useCallback((weekKey: string, px: number) => {
    setWidths((cur) => ({ ...cur, [weekKey]: px }))
  }, [])
  const resetWeekColumnWidths = React.useCallback(() => setWidths({}), [])
  return { weekColumnWidths, setWeekColumnWidth, resetWeekColumnWidths }
}
