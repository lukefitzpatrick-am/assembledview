"use client"

import { createContext, useContext } from "react"

const FinancePeriodsFlagContext = createContext(false)

/** Server layout injects `FINANCE_PERIODS` so Clients billing can hide the Periods tab. */
export function FinancePeriodsFlagProvider({
  enabled,
  children,
}: {
  enabled: boolean
  children: React.ReactNode
}) {
  return (
    <FinancePeriodsFlagContext.Provider value={enabled}>
      {children}
    </FinancePeriodsFlagContext.Provider>
  )
}

export function useFinancePeriodsFlag(): boolean {
  return useContext(FinancePeriodsFlagContext)
}
