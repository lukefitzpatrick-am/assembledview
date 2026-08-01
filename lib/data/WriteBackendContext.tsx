"use client"

import { createContext, useContext, type ReactNode } from "react"

import type { WriteBackend } from "@/lib/data/backend"

const WriteBackendContext = createContext<WriteBackend>("xano")

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
