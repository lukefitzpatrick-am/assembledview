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

/**
 * `perCall` applies only when `continuation` is true (a pause_turn follow-up).
 * `perRun` applies to the cumulative input of the whole run, including the first call.
 */
export function overInputCap(
  inputTokens: number,
  cumulativeInputTokens: number,
  caps: InputCaps,
  continuation: boolean,
): "per_call" | "per_run" | null {
  if (continuation && inputTokens > caps.perCall) return "per_call"
  if (cumulativeInputTokens > caps.perRun) return "per_run"
  return null
}

/**
 * Server tool block `type` strings on `BetaContentBlock` in @anthropic-ai/sdk 0.97.1.
 * Bash and text-editor calls are `BetaServerToolUseBlock` (`type: "server_tool_use"`)
 * with `name` `bash_code_execution` or `text_editor_code_execution`. The SDK has no
 * `bash_code_execution_tool_use` or `text_editor_code_execution_tool_use` block.
 */
export const SERVER_TOOL_BLOCK_TYPES = [
  "server_tool_use",
  "mcp_tool_use",
  "bash_code_execution_tool_result",
  "text_editor_code_execution_tool_result",
  "code_execution_tool_result",
  "web_search_tool_result",
  "web_fetch_tool_result",
  "advisor_tool_result",
  "tool_search_tool_result",
  "mcp_tool_result",
] as const

export type ContainerStep = {
  step: number
  tool: string
  command: string
  resultChars: number
  errored: boolean
  resultText: string
}

function commandOf(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ""
  const fields = input as Record<string, unknown>
  for (const key of COMMAND_KEYS) {
    const value = fields[key]
    if (typeof value === "string" && value.trim()) {
      const filePath = typeof fields.path === "string" ? fields.path : ""
      return filePath && key === "command" ? `${value} ${filePath}` : value
    }
  }
  const json = JSON.stringify(input)
  return json === "{}" ? "" : json
}

function resultOf(content: unknown): { text: string; errored: boolean } {
  if (typeof content === "string") return { text: content, errored: false }
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { text: "", errored: false }
  }
  const block = content as Record<string, unknown>
  const type = typeof block.type === "string" ? block.type : ""
  if (type.endsWith("_error") || typeof block.error_code === "string") {
    const message = typeof block.error_message === "string" ? block.error_message : ""
    const code = typeof block.error_code === "string" ? block.error_code : type
    return { text: message ? `${code}: ${message}` : JSON.stringify(block), errored: true }
  }
  const stdout = typeof block.stdout === "string" ? block.stdout : ""
  const stderr = typeof block.stderr === "string" ? block.stderr : ""
  if ("return_code" in block || stdout || stderr) {
    const returnCode = typeof block.return_code === "number" ? block.return_code : 0
    return { text: `${stdout}${stderr}`, errored: returnCode !== 0 }
  }
  if (typeof block.content === "string") return { text: block.content, errored: false }
  if (block.content && typeof block.content === "object") return resultOf(block.content)
  return { text: JSON.stringify(block), errored: false }
}

export function containerSteps(content: unknown): ContainerStep[] {
  if (!Array.isArray(content)) return []
  const known = new Set<string>(SERVER_TOOL_BLOCK_TYPES)
  const uses: { id: string; tool: string; command: string }[] = []
  const results = new Map<string, { text: string; errored: boolean }>()
  for (const block of content) {
    if (!block || typeof block !== "object") continue
    const row = block as Record<string, unknown>
    const type = typeof row.type === "string" ? row.type : ""
    if (type === "server_tool_use" || type === "mcp_tool_use") {
      uses.push({
        id: typeof row.id === "string" ? row.id : "",
        tool: typeof row.name === "string" ? row.name : type,
        command: commandOf(row.input),
      })
    }
    if (known.has(type) && type.endsWith("_tool_result") && typeof row.tool_use_id === "string") {
      results.set(row.tool_use_id, resultOf(row.content))
    }
  }
  return uses.map((use, index) => {
    const result = results.get(use.id) ?? { text: "", errored: false }
    return {
      step: index + 1,
      tool: use.tool,
      command: use.command,
      resultChars: result.text.length,
      errored: result.errored,
      resultText: result.text,
    }
  })
}
