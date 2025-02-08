"use client"

import { createContext, useState, type ReactNode, useContext } from "react"

interface MediaPlanContextType {
  mbaNumber: string
  setMbaNumber: (number: string) => void
}

const MediaPlanContext = createContext<MediaPlanContextType | undefined>(undefined)

export function useMediaPlanContext() {
  const context = useContext(MediaPlanContext)
  if (context === undefined) {
    throw new Error("useMediaPlanContext must be used within a MediaPlanProvider")
  }
  return context
}

interface MediaPlanProviderProps {
  children: ReactNode
}

export function MediaPlanProvider({ children }: MediaPlanProviderProps) {
  const [mbaNumber, setMbaNumber] = useState("")

  return <MediaPlanContext.Provider value={{ mbaNumber, setMbaNumber }}>{children}</MediaPlanContext.Provider>
}

