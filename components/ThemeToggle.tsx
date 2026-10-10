"use client"

import * as React from "react"
import { useTheme } from "next-themes"

import { segmentChipClass } from "@/components/layout/navChip"
import { cn } from "@/lib/utils"

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const isDark = mounted ? resolvedTheme === "dark" : false

  return (
    <div
      role="group"
      aria-label="Colour mode"
      className={cn("inline-flex rounded-pill bg-[var(--fill-track)] p-0.5", className)}
    >
      <button
        type="button"
        aria-pressed={!isDark}
        className={segmentChipClass(!isDark)}
        onClick={() => setTheme("light")}
      >
        Light
      </button>
      <button
        type="button"
        aria-pressed={isDark}
        className={segmentChipClass(isDark)}
        onClick={() => setTheme("dark")}
      >
        Black
      </button>
    </div>
  )
}

