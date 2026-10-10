import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

export type InsightActionOutcomeInput = {
  body?: string | null
  action?: string | null
  actionOwner?: string | null
  action_owner?: string | null
  outcome?: string | null
  outcomeKind?: string | null
  outcome_kind?: string | null
}

export type IAOFigures = {
  insight?: string | null
  action?: string | null
  outcome?: string | null
}

const TAG = {
  insight: "bg-am-sky text-am-ink",
  action: "bg-am-forest text-am-white",
  outcome: "bg-am-lime text-am-ink",
} as const

function filled(value: string | null | undefined): string | null {
  const text = value?.trim() ?? ""
  return text.length > 0 ? text : null
}

function outcomeKindLabel(kind: string | null): string | null {
  if (kind === "achieved") return "Achieved"
  if (kind === "expected") return "Expected"
  return null
}

function Card({
  id,
  tag,
  figure,
  children,
}: {
  id: "insight" | "action" | "outcome"
  tag: string
  figure: string | null
  children: ReactNode
}) {
  return (
    <article data-card={id} className="rounded-card bg-card p-[18px]">
      <span className={cn("inline-flex rounded-pill px-3 py-0.5 text-xs font-bold", TAG[id])}>
        {tag}
      </span>
      {figure ? <p className="num mt-2 text-[28px] font-extrabold text-am-forest">{figure}</p> : null}
      <div className="mt-2.5 text-[14px] text-text-secondary">{children}</div>
    </article>
  )
}

/** Insight, Action and Outcome. A card renders only when its text or figure is filled. */
export function IAOCards({
  insight,
  figures,
  className,
}: {
  insight: InsightActionOutcomeInput
  figures?: IAOFigures
  className?: string
}) {
  const body = filled(insight.body)
  const action = filled(insight.action)
  const owner = filled(insight.actionOwner ?? insight.action_owner)
  const outcome = filled(insight.outcome)
  const kind = outcomeKindLabel(filled(insight.outcomeKind ?? insight.outcome_kind))
  const insightFigure = filled(figures?.insight)
  const actionFigure = filled(figures?.action)
  const outcomeFigure = filled(figures?.outcome)

  const cards = [
    body || insightFigure ? (
      <Card key="insight" id="insight" tag="Insight" figure={insightFigure}>
        {body ? <p className="m-0">{body}</p> : null}
      </Card>
    ) : null,
    action || owner || actionFigure ? (
      <Card key="action" id="action" tag="Action" figure={actionFigure}>
        {action || owner ? (
          <p className="m-0">
            {action}
            {action && owner ? " " : null}
            {owner}
          </p>
        ) : null}
      </Card>
    ) : null,
    outcome || outcomeFigure ? (
      <Card key="outcome" id="outcome" tag="Outcome" figure={outcomeFigure}>
        {outcome ? <p className="m-0">{outcome}</p> : null}
        {kind ? <p className="m-0 mt-1 text-xs text-muted-foreground">{kind}</p> : null}
      </Card>
    ) : null,
  ].filter(Boolean)

  if (cards.length === 0) return null

  return (
    <div className={cn("grid grid-cols-1 gap-4 min-[980px]:grid-cols-3", className)}>
      {cards}
    </div>
  )
}
