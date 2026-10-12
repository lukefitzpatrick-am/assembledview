import Anthropic from "@anthropic-ai/sdk"
import { HTTP_TIMEOUT_MS } from "./deck-guardrails"

export const SPIKE_BETAS = [
  "code-execution-2025-05-22",
  "skills-2025-10-02",
  "files-api-2025-04-14",
  "output-128k-2025-02-19",
] as const

/** Opus 5.5 rates from platform.claude.com, 12 Oct 2026. This script does not call a pricing API. */
export const PRICE_USD_PER_MTOK = {
  input: 4,
  output: 20,
  cacheRead: 0.2,
  cacheWrite: 5,
} as const

export function reportModel(): string {
  const name = process.env.ANTHROPIC_REPORT_MODEL
  if (!name) {
    throw new Error(
      "ANTHROPIC_REPORT_MODEL is unset. Set it to the model id for this spike and rerun. This script does not fall back to ANTHROPIC_MODEL.",
    )
  }
  return name
}

const REPORT_EFFORTS = ["low", "medium", "high"] as const

export type ReportEffort = (typeof REPORT_EFFORTS)[number]

export function reportEffort(): ReportEffort {
  const effort = process.env.ANTHROPIC_REPORT_EFFORT
  if (!effort) {
    throw new Error(
      "ANTHROPIC_REPORT_EFFORT is unset. Set it to low, medium, or high and rerun. This script does not pick a default.",
    )
  }
  if (effort !== "low" && effort !== "medium" && effort !== "high") {
    throw new Error(
      `ANTHROPIC_REPORT_EFFORT must be low, medium, or high. Got ${JSON.stringify(effort)}.`,
    )
  }
  return effort
}

export function spikeClient(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is missing")
  return new Anthropic({ timeout: HTTP_TIMEOUT_MS })
}

export function estimateUsd(usage: {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}): number {
  const p = PRICE_USD_PER_MTOK
  return (
    (usage.input / 1_000_000) * p.input +
    (usage.output / 1_000_000) * p.output +
    (usage.cacheRead / 1_000_000) * p.cacheRead +
    (usage.cacheWrite / 1_000_000) * p.cacheWrite
  )
}
