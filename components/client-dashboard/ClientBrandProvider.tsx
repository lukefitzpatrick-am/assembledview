"use client"

import type { CSSProperties } from "react"
import { createContext, useContext, type ReactNode } from "react"

import {
  buildAssembledMediaAppDefaultTheme,
  buildClientBrandThemeFromDocumentCssVars,
  type ClientBrandTheme,
} from "@/lib/client-dashboard/theme"

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
  if (ctx != null) return ctx
  const fromCss = buildClientBrandThemeFromDocumentCssVars()
  if (fromCss != null) return fromCss
  return buildAssembledMediaAppDefaultTheme()
}

/** Theme from `ClientBrandProvider`, or `null` when used outside the provider. */
export function useClientBrandOptional(): ClientBrandTheme | null {
  return useContext(ClientBrandContext)
}

export function brandStyleVars(theme: ClientBrandTheme): CSSProperties {
  return {
    "--brand-primary": theme.primary,
    "--brand-primary-dark": theme.primaryDark,
    "--brand-tint": theme.primaryTint,
  } as CSSProperties
}
