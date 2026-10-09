/**
 * One source of truth for Claude model, effort and max_tokens.
 * Server-only. Opus 5.5 keeps adaptive thinking on — never send
 * `thinking: { type: "disabled" }`.
 */

import "server-only"

import type Anthropic from "@anthropic-ai/sdk"

export const EFFORT_LEVELS = ["low", "medium", "high", "xhigh", "max"] as const

export type EffortLevel = (typeof EFFORT_LEVELS)[number]

export type AvaModelProfileName = "chat" | "report"

/** Autopopulate keeps its own token cap and always streams. */
export type AvaJobProfile = AvaModelProfileName | "autopopulate"

export type AvaModelProfile = {
  model: string
  effort: EffortLevel
  maxTokens: number
}

export const DEFAULT_CHAT_MODEL = "claude-opus-5-5"
export const DEFAULT_REPORT_MODEL = "claude-opus-5-5"
export const DEFAULT_CHAT_EFFORT: EffortLevel = "medium"
export const DEFAULT_REPORT_EFFORT: EffortLevel = "high"
export const DEFAULT_CHAT_MAX_TOKENS = 16_000
export const DEFAULT_REPORT_MAX_TOKENS = 32_000
export const AUTOPOPULATE_MAX_TOKENS = 64_000
export const AUTOPOPULATE_EFFORT: EffortLevel = "medium"

/**
 * SDK throws on non-streaming create when expected time exceeds 10 minutes
 * (`max_tokens` above ~21333). Report and autopopulate always stream.
 */
export const NONSTREAMING_MAX_TOKENS = 21_333

/** load_skill results that switch a chat turn onto the report profile. */
export const REPORT_TURN_SKILL_IDS = [
  "assembled-performance-review-report",
  "assembled-insight-commentary",
  "assembled-presentations",
  "assembled-campaign-read",
  "assembled-brand",
] as const

const warned = new Set<string>()

export function resetAvaModelConfigWarningsForTests(): void {
  warned.clear()
}

function warnOnce(key: string, message: string): void {
  if (warned.has(key)) return
  warned.add(key)
  console.warn(message)
}

function readModel(envName: string, fallback: string): string {
  const raw = process.env[envName]?.trim()
  return raw ? raw : fallback
}

function readEffort(envName: string, fallback: EffortLevel): EffortLevel {
  const raw = process.env[envName]?.trim()
  if (!raw) return fallback
  if ((EFFORT_LEVELS as readonly string[]).includes(raw)) {
    return raw as EffortLevel
  }
  warnOnce(
    `effort:${envName}`,
    `[ava] ${envName}=${raw} is not a valid effort; using ${fallback}`,
  )
  return fallback
}

function readMaxTokens(envName: string, fallback: number): number {
  const raw = process.env[envName]?.trim()
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n < 1) {
    warnOnce(
      `maxTokens:${envName}`,
      `[ava] ${envName}=${raw} is not a positive integer; using ${fallback}`,
    )
    return fallback
  }
  return n
}

function warnLegacyModelEnv(): void {
  if (process.env.ANTHROPIC_MODEL?.trim()) {
    warnOnce(
      "ANTHROPIC_MODEL",
      "[ava] ANTHROPIC_MODEL is ignored; Claude calls use AVA_CHAT_* and AVA_REPORT_*",
    )
  }
  if (process.env.AVA_MAX_TOKENS?.trim()) {
    warnOnce(
      "AVA_MAX_TOKENS",
      "[ava] AVA_MAX_TOKENS is ignored; use AVA_CHAT_MAX_TOKENS or AVA_REPORT_MAX_TOKENS",
    )
  }
  if (process.env.INGEST_AUDIT_MODEL?.trim()) {
    warnOnce(
      "INGEST_AUDIT_MODEL",
      "[ava] INGEST_AUDIT_MODEL is ignored; line audit uses the chat profile",
    )
  }
}

export function profiles(): { chat: AvaModelProfile; report: AvaModelProfile } {
  warnLegacyModelEnv()
  return {
    chat: {
      model: readModel("AVA_CHAT_MODEL", DEFAULT_CHAT_MODEL),
      effort: readEffort("AVA_CHAT_EFFORT", DEFAULT_CHAT_EFFORT),
      maxTokens: readMaxTokens("AVA_CHAT_MAX_TOKENS", DEFAULT_CHAT_MAX_TOKENS),
    },
    report: {
      model: readModel("AVA_REPORT_MODEL", DEFAULT_REPORT_MODEL),
      effort: readEffort("AVA_REPORT_EFFORT", DEFAULT_REPORT_EFFORT),
      maxTokens: readMaxTokens("AVA_REPORT_MAX_TOKENS", DEFAULT_REPORT_MAX_TOKENS),
    },
  }
}

export function anthropicParamsFor(profile: AvaModelProfileName): {
  model: string
  max_tokens: number
  output_config: { effort: EffortLevel }
} {
  const row = profiles()[profile]
  return {
    model: row.model,
    max_tokens: row.maxTokens,
    output_config: { effort: row.effort },
  }
}

export function autopopulateAnthropicParams(): {
  model: string
  max_tokens: number
  output_config: { effort: EffortLevel }
} {
  return {
    model: profiles().report.model,
    max_tokens: AUTOPOPULATE_MAX_TOKENS,
    output_config: { effort: AUTOPOPULATE_EFFORT },
  }
}

function paramsForJob(profile: AvaJobProfile): {
  logProfile: AvaJobProfile
  model: string
  max_tokens: number
  output_config: { effort: EffortLevel }
} {
  if (profile === "autopopulate") {
    const params = autopopulateAnthropicParams()
    return { logProfile: "autopopulate", ...params }
  }
  return { logProfile: profile, ...anthropicParamsFor(profile) }
}

export function claudeCallStreams(profile: AvaJobProfile, maxTokens: number): boolean {
  return profile !== "chat" || maxTokens > NONSTREAMING_MAX_TOKENS
}

function textLoadsReportSkill(content: string): boolean {
  return REPORT_TURN_SKILL_IDS.some((id) => content.includes(`skillId: ${id}`))
}

function blockLoadsReportSkill(block: unknown): boolean {
  if (!block || typeof block !== "object") return false
  const rec = block as Record<string, unknown>
  if (rec.type === "tool_use" && rec.name === "load_skill") {
    const input = rec.input
    if (input && typeof input === "object") {
      const skillId = (input as { skillId?: unknown }).skillId
      if (
        typeof skillId === "string" &&
        (REPORT_TURN_SKILL_IDS as readonly string[]).includes(skillId)
      ) {
        return true
      }
    }
  }
  if (rec.type === "tool_result" || rec.type === "text") {
    const content = rec.type === "text" ? rec.text : rec.content
    if (typeof content === "string") return textLoadsReportSkill(content)
    if (Array.isArray(content)) return content.some(blockLoadsReportSkill)
  }
  return false
}

/** True once a report skill has been loaded into this turn's message history. */
export function messagesUseReportProfile(
  messages: Anthropic.MessageParam[],
): boolean {
  for (const message of messages) {
    if (typeof message.content === "string") {
      if (textLoadsReportSkill(message.content)) return true
      continue
    }
    if (message.content.some(blockLoadsReportSkill)) return true
  }
  return false
}

/**
 * Campaign-read generation passes `report`. Chat starts on `chat` and moves
 * to `report` for the rest of the turn after a report skill is loaded.
 */
export function resolveTurnProfile(
  messages: Anthropic.MessageParam[],
  explicit?: AvaModelProfileName,
): AvaModelProfileName {
  if (explicit === "report") return "report"
  if (messagesUseReportProfile(messages)) return "report"
  return "chat"
}

export type ClaudeCallParams = Omit<
  Anthropic.MessageCreateParamsNonStreaming,
  "model" | "max_tokens" | "output_config" | "stream" | "thinking"
> & {
  /** Dropped. Opus 5.5 rejects `thinking: { type: "disabled" }`. */
  thinking?: unknown
}

function usageCount(value: number | null | undefined): number {
  return Number.isFinite(value) ? Number(value) : 0
}

/**
 * One Claude call. Report and autopopulate stream so a large max_tokens
 * never hits the SDK non-streaming guard. Logs profile, model, effort and
 * token counts — never the prompt.
 */
export async function completeClaudeMessage(
  client: Anthropic,
  profile: AvaJobProfile,
  params: ClaudeCallParams,
  options?: { signal?: AbortSignal },
): Promise<Anthropic.Message> {
  const spec = paramsForJob(profile)
  const { thinking: _dropped, ...rest } = params
  const body = {
    ...rest,
    model: spec.model,
    max_tokens: spec.max_tokens,
    output_config: spec.output_config,
  }
  const requestOptions = options?.signal ? { signal: options.signal } : undefined
  const started = Date.now()
  const message = claudeCallStreams(profile, spec.max_tokens)
    ? await client.messages.stream(body, requestOptions).finalMessage()
    : await client.messages.create(body, requestOptions)
  console.log("[ava] claude", {
    profile: spec.logProfile,
    model: spec.model,
    effort: spec.output_config.effort,
    input_tokens: usageCount(message.usage?.input_tokens),
    output_tokens: usageCount(message.usage?.output_tokens),
    duration_ms: Date.now() - started,
  })
  return message
}
