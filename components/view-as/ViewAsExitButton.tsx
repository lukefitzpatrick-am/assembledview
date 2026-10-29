"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { exitViewAs } from "@/components/view-as/viewAsClient"

export function ViewAsExitButton() {
  const [busy, setBusy] = useState(false)
  return (
    <Button
      type="button"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        window.location.assign(await exitViewAs())
      }}
    >
      {busy ? "Exiting…" : "Exit client view"}
    </Button>
  )
}
