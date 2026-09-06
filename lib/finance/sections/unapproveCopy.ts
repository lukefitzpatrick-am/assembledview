/**
 * Un-approve copy — confirm names the grain; a 409 is the reason, not "failed".
 */

import { formatAUD } from "@/lib/format/money"

const EXPORTED_TITLE = "Already sent to finance"
const EXPORTED_REASON =
  "This invoice has been sent to finance. Un-mark sent before un-approving."

export function formatUnapproveMonthLabel(billingMonth: string): string {
  const [y, m] = billingMonth.split("-").map((part) => Number.parseInt(part, 10))
  if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return billingMonth
  return new Intl.DateTimeFormat("en-AU", { month: "long", year: "numeric" }).format(
    new Date(y, m - 1, 1)
  )
}

export function unapproveConfirmCopy(input: {
  clientName: string
  billingMonth: string
  amountDollars: number
}): { title: string; description: string } {
  const client = input.clientName.trim() || "This client"
  const month = formatUnapproveMonthLabel(input.billingMonth)
  return {
    title: "Un-approve this invoice?",
    description: `${client} · ${month} · ${formatAUD(input.amountDollars)}`,
  }
}

function stripHttpStatusPrefix(message: string): string {
  return message.replace(/^\[\d+]\s*/, "").trim()
}

function httpStatus(source: unknown): number | null {
  if (source && typeof source === "object" && "status" in source) {
    const status = (source as { status: unknown }).status
    return typeof status === "number" ? status : null
  }
  return null
}

export function unapproveFailureToast(source: unknown): {
  title: string
  description: string
  variant?: "destructive"
} {
  if (httpStatus(source) === 409) {
    const message = source instanceof Error ? source.message : EXPORTED_REASON
    return {
      title: EXPORTED_TITLE,
      description: stripHttpStatusPrefix(message) || EXPORTED_REASON,
    }
  }
  if (source && typeof source === "object" && "errors" in source) {
    const errors = (source as { errors?: Array<{ error?: string }> }).errors ?? []
    if (errors.some((e) => e.error === "already_exported")) {
      return { title: EXPORTED_TITLE, description: EXPORTED_REASON }
    }
  }
  const description =
    source instanceof Error ? stripHttpStatusPrefix(source.message) : "Unknown error"
  return {
    title: "Could not unapprove",
    description,
    variant: "destructive",
  }
}
