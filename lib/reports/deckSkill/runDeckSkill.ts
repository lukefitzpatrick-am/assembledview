/**
 * One v5 skill deck. The skill id is DECK_SKILL_ID. This module never uploads a skill.
 * Uploaded inputs and the output file are deleted from the Files API on every exit.
 */
import "server-only"

import { toFile } from "@anthropic-ai/sdk"

import { getAnthropicClient } from "@/lib/ava/anthropic"
import { logJob } from "@/lib/log"
import { loadBrandKit, type DeckSkillKit } from "@/lib/reports/deckSkill/brandKit"
import { containerSteps, type ContainerStep } from "@/lib/reports/deckSkill/containerSteps"
import { assertDeckOpens } from "@/lib/reports/deckSkill/openDeck"
import { slimDeckPayload } from "@/scripts/spikes/report-deck-skill/slim-deck-payload"

export type { DeckSkillKit }

const INPUT_USD_PER_MILLION = 4
const OUTPUT_USD_PER_MILLION = 20
const CACHE_WRITE_USD_PER_MILLION = 5
const CACHE_READ_USD_PER_MILLION = 0.2
export const DECK_SKILL_COST_CAP_USD = 0.6
export const DECK_SKILL_WALL_MS = 240_000
const MAX_TOKENS = 32_000

const BETAS = [
  "code-execution-2025-05-22",
  "skills-2025-10-02",
  "files-api-2025-04-14",
  "output-128k-2025-02-19",
] as const

const FILES_BETA = ["files-api-2025-04-14"] as const
const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const
const TEMPLATE_NAME = "Assembled-Media-Template-v5.potx"
const TEMPLATE_TYPE = "application/vnd.openxmlformats-officedocument.presentationml.template"

type Effort = (typeof EFFORTS)[number]

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }

export class DeckSkillLimitError extends Error {
  readonly limit: "cost" | "wall"

  constructor(limit: "cost" | "wall", message: string) {
    super(message)
    this.name = "DeckSkillLimitError"
    this.limit = limit
  }
}

export type DeckSkillUsage = {
  input_tokens?: number | null
  output_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

export type DeckSkillMessage = {
  stop_reason?: string | null
  content: unknown
  container?: { id?: string | null } | null
  usage?: DeckSkillUsage | null
}

export type DeckSkillClient = {
  beta: {
    files: {
      upload: (params: { file: unknown; betas: string[] }) => Promise<{ id: string; filename?: string | null }>
      download: (fileId: string, params: { betas: string[] }) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> }>
      delete: (fileId: string, params: { betas: string[] }) => Promise<unknown>
      retrieveMetadata: (fileId: string, params: { betas: string[] }) => Promise<{ filename?: string | null }>
    }
    messages: {
      create: (
        body: Record<string, unknown>,
        options?: { timeout?: number },
      ) => Promise<DeckSkillMessage>
    }
  }
}

export type DeckSkillInput = {
  mbaNumber: string
  report: unknown
  fileName: string
}

export type DeckSkillDeps = {
  client?: DeckSkillClient
  kit?: DeckSkillKit
  now?: () => number
}

type Outcome = "ok" | "cost_cap" | "wall" | "error"

function count(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}

function addUsage(total: Usage, usage: DeckSkillUsage | null | undefined): void {
  total.input += count(usage?.input_tokens)
  total.output += count(usage?.output_tokens)
  total.cacheRead += count(usage?.cache_read_input_tokens)
  total.cacheWrite += count(usage?.cache_creation_input_tokens)
}

export function deckSkillCostUsd(usage: Usage): number {
  return (
    (usage.input * INPUT_USD_PER_MILLION +
      usage.output * OUTPUT_USD_PER_MILLION +
      usage.cacheWrite * CACHE_WRITE_USD_PER_MILLION +
      usage.cacheRead * CACHE_READ_USD_PER_MILLION) /
    1_000_000
  )
}

function modelFromEnv(): string {
  const model = process.env.DECK_SKILL_MODEL?.trim()
  return model || "claude-opus-5-5"
}

function effortFromEnv(): Effort {
  const effort = process.env.DECK_SKILL_EFFORT?.trim()
  if (!effort) return "high"
  if ((EFFORTS as readonly string[]).includes(effort)) return effort as Effort
  throw new Error(`DECK_SKILL_EFFORT must be low, medium, high, xhigh, or max. Got ${JSON.stringify(effort)}.`)
}

function skillIdFromEnv(): string {
  const id = process.env.DECK_SKILL_ID?.trim()
  if (!id) throw new Error("DECK_SKILL_ID is unset")
  return id
}

function userMessage(mbaNumber: string): string {
  return [
    "The input files are report-data.json, Assembled-Media-Template-v5.potx, and three library photos.",
    "They are already in the container input directory. Do not fetch anything.",
    "Build the Assembled Media campaign performance report by following av-campaign-report-v5 exactly.",
    "Run summarise.py, pipe the content JSON into write_content.py, then build_report.py.",
    `Then run python /skills/av-campaign-report-v5/scripts/check_deck.py "$OUTPUT_DIR/${mbaNumber}.pptx" "$INPUT_DIR/report-data.json" content.json.`,
    "Do not view or open images. Do not read the skill scripts. Do not print files. Do not write your own build script.",
    "Use only the formatted strings in report-data.json, via the keys in content.json.",
    `Save the deck to $OUTPUT_DIR/${mbaNumber}.pptx.`,
  ].join(" ")
}

function imageType(filename: string): string {
  return filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg"
}

function collectOutputIds(node: unknown, fileIds: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) collectOutputIds(item, fileIds)
    return
  }
  if (!node || typeof node !== "object") return
  const block = node as { type?: string; file_id?: string; content?: unknown }
  if (
    (block.type === "code_execution_output" || block.type === "bash_code_execution_output") &&
    block.file_id
  ) {
    fileIds.add(block.file_id)
  }
  if (block.content) collectOutputIds(block.content, fileIds)
}

function clip(value: string): string {
  return value.length > 200 ? `${value.slice(0, 200)}…` : value
}

async function deleteFiles(client: DeckSkillClient, ids: Iterable<string>): Promise<void> {
  const seen = new Set<string>()
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    try {
      await client.beta.files.delete(id, { betas: [...FILES_BETA] })
    } catch (err) {
      logJob("[deck-skill] file delete failed", {
        file_id: id,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }
}

export async function runDeckSkill(
  input: DeckSkillInput,
  deps?: DeckSkillDeps,
): Promise<{ buffer: Buffer; fileName: string }> {
  const mbaNumber = input.mbaNumber.trim()
  if (!mbaNumber) throw new Error("mbaNumber is required")
  const skillId = skillIdFromEnv()
  const model = modelFromEnv()
  const effort = effortFromEnv()
  const now = deps?.now ?? Date.now
  const started = now()
  const client = deps?.client ?? (getAnthropicClient() as unknown as DeckSkillClient)
  const deckJson = JSON.stringify(slimDeckPayload(input.report))
  const kit = deps?.kit ?? (await loadBrandKit())
  if (kit.photos.length !== 3) throw new Error("need 3 cover photos")

  const usage = emptyUsage()
  const steps: ContainerStep[] = []
  const uploadedIds: string[] = []
  const outputIds = new Set<string>()
  let outcome: Outcome = "ok"
  let continuations = 0
  let pptx: Buffer | null = null

  const overWall = () => now() - started >= DECK_SKILL_WALL_MS

  try {
    if (overWall()) {
      outcome = "wall"
      throw new DeckSkillLimitError("wall", "Wall time of 240 seconds")
    }

    const [reportFile, templateFile, ...photoFiles] = await Promise.all([
      toFile(Buffer.from(deckJson), "report-data.json", { type: "application/json" }),
      toFile(kit.template, TEMPLATE_NAME, { type: TEMPLATE_TYPE }),
      ...kit.photos.map((photo) => toFile(photo.bytes, photo.filename, { type: imageType(photo.filename) })),
    ])
    const uploads = await Promise.all(
      [reportFile, templateFile, ...photoFiles].map(async (file) => {
        const meta = await client.beta.files.upload({ file, betas: [...FILES_BETA] })
        uploadedIds.push(meta.id)
        return meta
      }),
    )

    const messages: Record<string, unknown>[] = [
      {
        role: "user",
        content: [
          ...uploads.map((file) => ({ type: "container_upload", file_id: file.id })),
          { type: "text", text: userMessage(mbaNumber), cache_control: { type: "ephemeral" } },
        ],
      },
    ]
    let containerId: string | undefined

    for (;;) {
      if (overWall()) {
        outcome = "wall"
        throw new DeckSkillLimitError("wall", "Wall time of 240 seconds")
      }
      const remaining = DECK_SKILL_WALL_MS - (now() - started)
      const response = await client.beta.messages.create(
        {
          model,
          max_tokens: MAX_TOKENS,
          betas: [...BETAS],
          tools: [{ type: "code_execution_20250825", name: "code_execution" }],
          container: {
            ...(containerId ? { id: containerId } : {}),
            skills: [{ type: "custom", skill_id: skillId, version: "latest" }],
          },
          output_config: { effort },
          messages,
        },
        { timeout: Math.max(1_000, remaining) },
      )
      containerId = response.container?.id ?? containerId
      addUsage(usage, response.usage)
      const nextSteps = containerSteps(response.content).map((step) => ({
        ...step,
        step: steps.length + step.step,
      }))
      steps.push(...nextSteps)
      const freshIds = new Set<string>()
      collectOutputIds(response.content, freshIds)
      for (const fileId of freshIds) {
        outputIds.add(fileId)
        try {
          const meta = await client.beta.files.retrieveMetadata(fileId, { betas: [...FILES_BETA] })
          const downloaded = await client.beta.files.download(fileId, { betas: [...FILES_BETA] })
          const bytes = Buffer.from(await downloaded.arrayBuffer())
          if ((meta.filename ?? "").toLowerCase().endsWith(".pptx")) pptx = bytes
        } catch (err) {
          logJob("[deck-skill] file download failed", {
            mba: mbaNumber,
            file_id: fileId,
            message: err instanceof Error ? err.message : String(err),
          })
        }
      }

      if (deckSkillCostUsd(usage) > DECK_SKILL_COST_CAP_USD) {
        outcome = "cost_cap"
        throw new DeckSkillLimitError("cost", "Cost cap of $0.60")
      }
      if (overWall()) {
        outcome = "wall"
        throw new DeckSkillLimitError("wall", "Wall time of 240 seconds")
      }
      if (response.stop_reason !== "pause_turn") break
      continuations += 1
      messages.push({ role: "assistant", content: response.content })
    }

    if (!pptx) throw new Error("container wrote no pptx")
    await assertDeckOpens(pptx)
    return { buffer: pptx, fileName: input.fileName }
  } catch (err) {
    if (outcome === "ok") outcome = "error"
    throw err
  } finally {
    logJob("[deck-skill]", {
      mba: mbaNumber,
      model,
      effort,
      outcome,
      input_tokens: usage.input,
      output_tokens: usage.output,
      cache_read_tokens: usage.cacheRead,
      cache_write_tokens: usage.cacheWrite,
      cost_usd: Number(deckSkillCostUsd(usage).toFixed(6)),
      wall_ms: now() - started,
      continuations,
      steps: steps.map((step) => ({
        step: step.step,
        tool: step.tool,
        command: clip(step.command),
        resultChars: step.resultChars,
        errored: step.errored,
      })),
    })
    await deleteFiles(client, [...uploadedIds, ...outputIds])
  }
}
