import type { ReactNode } from "react"

export default function PacingLayout({ children }: { children: ReactNode }) {
  return <div className="bg-surface-muted px-4 pb-12 pt-8 md:px-6">{children}</div>
}

