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

export type ContainerStep = {
  step: number
  tool: string
  command: string
  resultChars: number
  errored: boolean
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
    }
  })
}
