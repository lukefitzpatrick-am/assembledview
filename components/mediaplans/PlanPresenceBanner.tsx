"use client"

/**
 * Edit-page only. Information, not a lock — never a modal or a third hero row.
 */
export function PlanPresenceBanner({ line }: { line: string | null }) {
  if (!line) return null
  return (
    <p className="text-sm text-muted-foreground" role="status">
      {line}
    </p>
  )
}
