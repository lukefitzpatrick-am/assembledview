"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { WriteBackend } from "@/lib/data/backend"

/**
 * Defaults to the only live save path. The Xano save route refuses every
 * request, so a page mounted without the provider must not fall back to it
 * (F6, 1 Nov 2026).
 */
const WriteBackendContext = createContext<WriteBackend>("postgres")

/**
 * Server layouts inject `WRITE_BACKEND` so client create/edit pages can choose
 * the transactional Postgres save path without reading env in the browser.
 */
export function WriteBackendProvider({
  writeBackend,
  children,
}: {
  writeBackend: WriteBackend
  children: ReactNode
}) {
  return (
    <WriteBackendContext.Provider value={writeBackend}>
      {children}
    </WriteBackendContext.Provider>
  )
}

export function useWriteBackend(): WriteBackend {
  return useContext(WriteBackendContext)
}
