"use client"

/**
 * S2 A: asked when a publish would change months already invoiced. Lists each
 * month (billed, this version, change) and the two choices, with keep
 * selected. "Adjust with a credit" is shown and disabled until S11.
 * Mounted once on each plan page; `postPlansSave` asks it.
 */
import { useEffect, useRef, useState } from "react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CREDIT_UNAVAILABLE_REASON, type BilledMonth, type BilledMonthsChoice } from "@/lib/finance/billedMonths/choice"
import { centsLabel, monthShort } from "@/lib/finance/revisions/panelModel"
import { registerBilledMonthsChooser } from "@/lib/mediaplan/billedMonthsChoicePrompt"

function changeLabel(m: BilledMonth): string {
  if (m.deltaCents === 0) return "Same total, lines differ"
  return `${m.deltaCents > 0 ? "+" : "-"}${centsLabel(Math.abs(m.deltaCents))}`
}

export function BilledMonthsChoiceHost() {
  const [months, setMonths] = useState<BilledMonth[] | null>(null)
  const [choice, setChoice] = useState<BilledMonthsChoice>("keep")
  const answer = useRef<((c: BilledMonthsChoice | null) => void) | null>(null)

  useEffect(
    () =>
      registerBilledMonthsChooser(
        (m) =>
          new Promise((resolve) => {
            answer.current?.(null)
            answer.current = resolve
            setChoice("keep")
            setMonths(m)
          }),
      ),
    [],
  )

  const finish = (c: BilledMonthsChoice | null) => {
    answer.current?.(c)
    answer.current = null
    setMonths(null)
  }

  return (
    <AlertDialog open={months != null} onOpenChange={(open) => !open && finish(null)}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle>This version changes invoiced months</AlertDialogTitle>
          <AlertDialogDescription>
            These months are already invoiced. Choose what happens to them before this version is published.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <table className="w-full text-sm">
          <caption className="sr-only">Invoiced months this version changes</caption>
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-1 pr-3 font-medium">Month</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">Billed</th>
              <th scope="col" className="py-1 pr-3 text-right font-medium">This version</th>
              <th scope="col" className="py-1 text-right font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {(months ?? []).map((m) => (
              <tr key={m.month} className="border-b last:border-0">
                <th scope="row" className="py-1 pr-3 text-left font-normal">{monthShort(m.month)}</th>
                <td className="py-1 pr-3 text-right tabular-nums">{centsLabel(m.baseCents)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{centsLabel(m.candidateCents)}</td>
                <td className="py-1 text-right tabular-nums">{changeLabel(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-medium">What happens to these months</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="billed-months-choice"
              value="keep"
              checked={choice === "keep"}
              onChange={() => setChoice("keep")}
              aria-describedby="billed-months-keep-help"
              className="mt-1"
            />
            <span>
              <span className="font-medium">Keep billed rows</span>
              <span id="billed-months-keep-help" className="block text-muted-foreground">
                The invoiced months stay exactly as billed. This version&apos;s changes to them do not reach billing.
                Other months follow this version.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-muted-foreground">
            <input
              type="radio"
              name="billed-months-choice"
              value="credit"
              checked={choice === "credit"}
              disabled
              aria-describedby="billed-months-credit-help"
              className="mt-1"
            />
            <span>
              <span className="font-medium">Adjust with a credit</span>
              <span id="billed-months-credit-help" className="block">
                {CREDIT_UNAVAILABLE_REASON}
              </span>
            </span>
          </label>
        </fieldset>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => finish(null)}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={choice !== "keep"} onClick={() => finish(choice)}>
            Publish, keeping billed rows
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
