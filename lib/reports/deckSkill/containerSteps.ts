/** Container tool steps from a code-execution Messages response. */

const COMMAND_KEYS = ["command", "code", "cmd"] as const

const SERVER_TOOL_BLOCK_TYPES = [
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

export const DECK_STEP_IO_CHARS = 4_000

export type ContainerStep = {
  step: number
  tool: string
  command: string
  exitStatus: number | null
  stdout: string
  stderr: string
  resultChars: number
  errored: boolean
}

function clipIo(value: string): string {
  return value.length > DECK_STEP_IO_CHARS ? value.slice(0, DECK_STEP_IO_CHARS) : value
}

function commandOf(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return ""
  const fields = input as Record<string, unknown>
  for (const key of COMMAND_KEYS) {
    const value = fields[key]
    if (typeof value === "string" && value.trim()) return value
  }
  const json = JSON.stringify(input)
  return json === "{}" ? "" : json
}

function resultOf(content: unknown): {
  stdout: string
  stderr: string
  exitStatus: number | null
  errored: boolean
} {
  if (typeof content === "string") {
    return { stdout: content, stderr: "", exitStatus: null, errored: false }
  }
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    return { stdout: "", stderr: "", exitStatus: null, errored: false }
  }
  const block = content as Record<string, unknown>
  const type = typeof block.type === "string" ? block.type : ""
  if (type.endsWith("_error") || typeof block.error_code === "string") {
    const message = typeof block.error_message === "string" ? block.error_message : ""
    const code = typeof block.error_code === "string" ? block.error_code : type
    return {
      stdout: "",
      stderr: message ? `${code}: ${message}` : JSON.stringify(block),
      exitStatus: null,
      errored: true,
    }
  }
  const stdout = typeof block.stdout === "string" ? block.stdout : ""
  const stderr = typeof block.stderr === "string" ? block.stderr : ""
  if ("return_code" in block || stdout || stderr) {
    const exitStatus = typeof block.return_code === "number" ? block.return_code : 0
    return { stdout, stderr, exitStatus, errored: exitStatus !== 0 }
  }
  if (typeof block.content === "string") {
    return { stdout: block.content, stderr: "", exitStatus: null, errored: false }
  }
  if (block.content && typeof block.content === "object") return resultOf(block.content)
  return { stdout: JSON.stringify(block), stderr: "", exitStatus: null, errored: false }
}

export function containerSteps(content: unknown): ContainerStep[] {
  if (!Array.isArray(content)) return []
  const known = new Set<string>(SERVER_TOOL_BLOCK_TYPES)
  const uses: { id: string; tool: string; command: string }[] = []
  const results = new Map<string, ReturnType<typeof resultOf>>()
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
    const result = results.get(use.id) ?? { stdout: "", stderr: "", exitStatus: null, errored: false }
    return {
      step: index + 1,
      tool: use.tool,
      command: use.command,
      exitStatus: result.exitStatus,
      stdout: clipIo(result.stdout),
      stderr: clipIo(result.stderr),
      resultChars: result.stdout.length + result.stderr.length,
      errored: result.errored,
    }
  })
}
