import { formatMoney } from "@/lib/format/money"
import { ASSUMED_SPEND_LABEL } from "@/lib/spend/assumedSpend"
import type { ChannelPacingRow } from "@/lib/pacing/portfolio/types"

function formatWhole(value: number): string {
  return formatMoney(value, { decimals: 0 })
}

function formatDeliverableCount(value: number): string {
  return new Intl.NumberFormat("en-AU", { maximumFractionDigits: 0 }).format(value)
}

/** Channel amount on the pacing card and pacing detail. */
export function channelSpendCaption(channel: ChannelPacingRow): string {
  if (channel.spendMode === "assumed") {
    return `${ASSUMED_SPEND_LABEL} ${formatWhole(channel.spendToDate)} / ${formatWhole(channel.budget)}`
  }
  if (channel.spendMode === "estimated" && channel.spendToDate > 0) {
    return `Estimated ${formatWhole(channel.spendToDate)} / ${formatWhole(channel.budget)}`
  }
  if (channel.spendMode === "reported" && channel.spendToDate > 0) {
    return `${formatWhole(channel.spendToDate)} / ${formatWhole(channel.budget)}`
  }
  if (channel.spendMode !== "actual" && channel.deliverable) {
    return `${formatDeliverableCount(channel.deliverable.delivered)} / ${formatDeliverableCount(channel.deliverable.planned)} ${channel.deliverable.unit}`
  }
  return `${formatWhole(channel.spendToDate)} / ${formatWhole(channel.budget)}`
}
