/** Token and continuation limits for scripts/spikes/report-deck-skill/run-deck.ts. */

export const MAX_CONTINUATIONS = 8
export const HTTP_TIMEOUT_MS = 10 * 60 * 1000

const COMMAND_KEYS = ["command", "code", "cmd"] as const

export type InputCaps = { perCall: number; perRun: number }

function positiveInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`)
  }
  return value
}

export function spikeInputCaps(): InputCaps {
  return {
    perCall: positiveInt("ANTHROPIC_SPIKE_MAX_INPUT", 150_000),
    perRun: positiveInt("ANTHROPIC_SPIKE_MAX_RUN_INPUT", 600_000),
  }
}

export function clipCommand(command: string | null, max = 4000): string {
  if (!command) return "(none recorded)"
  if (command.length <= max) return command
  return `${command.slice(0, max)}\n… truncated ${command.length - max} chars`
}

export function lastToolCommand(content: unknown): string | null {
  let last: string | null = null
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    if (!node || typeof node !== "object") return
    const block = node as Record<string, unknown>
    const input = block.input
    if (input && typeof input === "object" && !Array.isArray(input)) {
      const fields = input as Record<string, unknown>
      for (const key of COMMAND_KEYS) {
        const value = fields[key]
        if (typeof value === "string" && value.trim()) last = value
      }
    }
    if (block.content !== undefined) visit(block.content)
  }
  visit(content)
  return last
}

export function overInputCap(
  inputTokens: number,
  cumulativeInputTokens: number,
  caps: InputCaps,
): "per_call" | "per_run" | null {
  if (inputTokens > caps.perCall) return "per_call"
  if (cumulativeInputTokens > caps.perRun) return "per_run"
  return null
}
