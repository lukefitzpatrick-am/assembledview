"use client"

import React, { createContext, useContext, useState, ReactNode } from "react"

interface MediaPlanContextType {
  mbaNumber: string
  setMbaNumber: (number: string) => void
}

const MediaPlanContext = createContext<MediaPlanContextType | undefined>(undefined)

export function MediaPlanProvider({ children }: { children: ReactNode }) {
  const [mbaNumber, setMbaNumber] = useState<string>("")

  return (
    <MediaPlanContext.Provider value={{ mbaNumber, setMbaNumber }}>
      {children}
    </MediaPlanContext.Provider>
  )
}

export function useMediaPlanContext() {
  const context = useContext(MediaPlanContext)
  if (context === undefined) {
    throw new Error("useMediaPlanContext must be used within a MediaPlanProvider")
  }
  return context
}

