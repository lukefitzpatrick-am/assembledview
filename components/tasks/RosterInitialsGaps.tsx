import type { InitialsGap } from "@/lib/codex/rosterRules"

/**
 * Team tab (B53, S18): people who need an initials alias added by hand. The
 * app never gives a shared initials alias to one of two people (C-58).
 */
export function RosterInitialsGaps({ gaps }: { gaps: readonly InitialsGap[] }) {
  if (gaps.length === 0) return null
  return (
    <div className="rounded-card border border-border bg-surface-panel px-4 py-3 text-sm shadow-e0" role="status">
      <p className="font-medium text-foreground">Initials aliases to add by hand</p>
      <p className="mt-1 text-muted-foreground">
        Everyone gets an initials alias. These people could not get theirs. Open the person and add an alias in Email
        aliases, such as their first name and the first two letters of their surname.
      </p>
      <ul className="mt-2 space-y-1">
        {gaps.map((gap) => (
          <li key={gap.email} className="text-muted-foreground">
            <span className="text-foreground">{gap.name}</span>
            {gap.alias ? (
              <>
                {" "}
                (<span className="font-mono text-xs text-foreground">{gap.alias}</span>) shares {gap.initials} with{" "}
                {gap.sharedWith.join(" and ")}.
              </>
            ) : (
              <> has no initials alias the app can make. Add one by hand.</>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
