"use client"

import type { CSSProperties } from "react"
import { createContext, useContext, type ReactNode } from "react"

import type { ClientBrandTheme } from "@/lib/client-dashboard/theme"

const ClientBrandContext = createContext<ClientBrandTheme | null>(null)

export type ClientBrandProviderProps = {
  theme: ClientBrandTheme
  children: ReactNode
}

export function ClientBrandProvider({ theme, children }: ClientBrandProviderProps) {
  return (
    <ClientBrandContext.Provider value={theme}>
      <div style={brandStyleVars(theme)} className="min-h-0">
        {children}
      </div>
    </ClientBrandContext.Provider>
  )
}

export function useClientBrand(): ClientBrandTheme {
  const ctx = useContext(ClientBrandContext)
  if (ctx == null) {
    throw new Error("useClientBrand must be used within a ClientBrandProvider")
  }
  return ctx
}

export function brandStyleVars(theme: ClientBrandTheme): CSSProperties {
  return {
    "--brand-primary": theme.primary,
    "--brand-primary-dark": theme.primaryDark,
    "--brand-tint": theme.primaryTint,
  } as CSSProperties
}
