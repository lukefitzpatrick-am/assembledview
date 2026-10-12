/**
 * Build one campaign report deck with the av-campaign-report skill.
 *
 * node --env-file=.env.local --import tsx scripts/spikes/report-deck-skill/run-deck.ts hema007
 *
 * Requires ANTHROPIC_REPORT_MODEL. Does not fall back to ANTHROPIC_MODEL.
 * Aborts when one call's input_tokens exceeds ANTHROPIC_SPIKE_MAX_INPUT
 * (default 150000) or the run's cumulative input exceeds
 * ANTHROPIC_SPIKE_MAX_RUN_INPUT (default 600000).
 */
import { execFile } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import Anthropic, { toFile } from "@anthropic-ai/sdk"
import {
  clipCommand,
  HTTP_TIMEOUT_MS,
  lastToolCommand,
  MAX_CONTINUATIONS,
  overInputCap,
  spikeInputCaps,
} from "./deck-guardrails"
import { checkDeckNumbers } from "./number-check"
import { slimDeckPayload } from "./slim-deck-payload"
import { estimateUsd, reportModel, SPIKE_BETAS, spikeClient } from "./spike-client"

const execFileAsync = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../..")
const outDir = path.join(here, "out")
const DISPLAY_TITLE = "av-campaign-report"

const USER_MESSAGE = [
  "The input file is report-data.json.",
  "assembled-template.pptx is in the same input directory. Copy it to assets/assembled-template.pptx before loading the template.",
  "Build the Assembled Media campaign performance report deck from report-data.json.",
  "Follow the av-campaign-report skill, including its slide plan and inspection limits.",
  "Never print a whole file or a whole tool listing. Pipe every inspection through head -c 4000.",
  "Use references/slide-catalogue.md to choose slides. Call placeholders() only on the slides being used, after keep_slides.",
  "Don't base64 or print images or XML.",
  "Copy numeral strings from report-data.json exactly.",
  "Save the pptx in the container output directory.",
].join(" ")

type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number }

function emptyUsage(): Usage {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
}

function addUsage(total: Usage, usage: Anthropic.Beta.BetaUsage): void {
  total.input += usage.input_tokens
  total.output += usage.output_tokens
  total.cacheRead += usage.cache_read_input_tokens ?? 0
  total.cacheWrite += usage.cache_creation_input_tokens ?? 0
}

function walkOutputs(node: unknown, fileIds: Set<string>, logs: string[]): void {
  if (Array.isArray(node)) {
    for (const item of node) walkOutputs(item, fileIds, logs)
    return
  }
  if (!node || typeof node !== "object") return
  const block = node as {
    type?: string
    file_id?: string
    stdout?: string
    stderr?: string
    text?: string
    content?: unknown
  }
  if (
    (block.type === "code_execution_output" || block.type === "bash_code_execution_output") &&
    block.file_id
  ) {
    fileIds.add(block.file_id)
  }
  if (typeof block.stdout === "string" && block.stdout) logs.push(block.stdout)
  if (typeof block.stderr === "string" && block.stderr) logs.push(block.stderr)
  if (typeof block.text === "string" && block.text) logs.push(block.text)
  if (block.content) walkOutputs(block.content, fileIds, logs)
}

async function skillId(client: Anthropic): Promise<string> {
  for await (const skill of client.beta.skills.list({ betas: ["skills-2025-10-02"] })) {
    if (skill.display_title === DISPLAY_TITLE) return skill.id
  }
  throw new Error("custom skill av-campaign-report is not uploaded")
}

function sofficeUsed(logs: string[]): boolean {
  const text = logs.join("\n")
  if (!/soffice/.test(text)) return false
  if (/soffice: not found|No such file or directory: ['"]?soffice|which: no soffice/.test(text)) return false
  return true
}

async function localSoffice(): Promise<string | null> {
  const candidates = [
    "soffice",
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ]
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"])
      return candidate
    } catch {
      // try the next path
    }
  }
  return null
}

async function renderPngs(soffice: string | null, pptxPath: string, mba: string): Promise<string[]> {
  if (!soffice) return []
  const pdfPath = path.join(outDir, `${mba}.pdf`)
  await execFileAsync(soffice, ["--headless", "--convert-to", "pdf", "--outdir", outDir, pptxPath])
  const rendered: string[] = []
  try {
    await execFileAsync("pdftoppm", ["-png", pdfPath, path.join(outDir, mba)])
    rendered.push(...fs.readdirSync(outDir).filter((name) => name.startsWith(`${mba}-`) && name.endsWith(".png")).map((name) => path.join(outDir, name)))
  } catch {
    const pngPath = path.join(outDir, `${mba}.png`)
    await execFileAsync(soffice, ["--headless", "--convert-to", "png", "--outdir", outDir, pptxPath])
    if (fs.existsSync(pngPath)) rendered.push(pngPath)
  }
  return rendered
}

function is499(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 499
}

function appendCallLog(mba: string, line: unknown): void {
  fs.mkdirSync(outDir, { recursive: true })
  fs.appendFileSync(path.join(outDir, `${mba}-calls.jsonl`), `${JSON.stringify(line)}\n`)
}

async function runOne(client: Anthropic, id: string, mba: string): Promise<number> {
  const jsonPath = path.join(
    repoRoot,
    "docs/superpowers/overnight-av-fixes/discovery",
    `AV-TP10-${mba}-2026-09.json`,
  )
  if (!fs.existsSync(jsonPath)) throw new Error(`missing fixture ${jsonPath}`)
  const assembled = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as unknown
  const deckPayload = slimDeckPayload(assembled)
  const deckJson = JSON.stringify(deckPayload)
  const deckBytes = Buffer.byteLength(deckJson)
  fs.mkdirSync(outDir, { recursive: true })
  const deckJsonPath = path.join(outDir, `${mba}-report-data.json`)
  fs.writeFileSync(deckJsonPath, deckJson)
  console.log(JSON.stringify({ mba, deck_payload_bytes: deckBytes, deck_payload: deckJsonPath }))

  const started = Date.now()
  const templatePath = path.join(here, "av-campaign-report", "assets", "assembled-template.pptx")
  const [reportFile, templateFile] = await Promise.all([
    toFile(Buffer.from(deckJson), "report-data.json", { type: "application/json" }),
    toFile(fs.readFileSync(templatePath), "assembled-template.pptx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    }),
  ])
  const [uploaded, template] = await Promise.all([
    client.beta.files.upload({ file: reportFile, betas: ["files-api-2025-04-14"] }),
    client.beta.files.upload({ file: templateFile, betas: ["files-api-2025-04-14"] }),
  ])
  console.log(JSON.stringify({
    mba,
    input_block: "container_upload",
    input_file_id: uploaded.id,
    input_filename: uploaded.filename,
    template_file_id: template.id,
    template_filename: template.filename,
  }))

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        { type: "text", text: USER_MESSAGE },
        { type: "container_upload", file_id: uploaded.id },
        { type: "container_upload", file_id: template.id },
      ],
    },
  ]
  const usage = emptyUsage()
  const fileIds = new Set<string>()
  const logs: string[] = []
  const caps = spikeInputCaps()
  let containerId: string | undefined
  let continuations = 0
  let stopReason = ""
  let commandBeforeCall: string | null = null
  const model = reportModel()

  for (let call = 1; ; call += 1) {
    const callStarted = Date.now()
    let response: Anthropic.Beta.BetaMessage
    try {
      response = await client.beta.messages.create(
        {
          model,
          max_tokens: 32000,
          betas: [...SPIKE_BETAS],
          tools: [{ type: "code_execution_20250825", name: "code_execution" }],
          container: {
            id: containerId,
            skills: [
              { type: "custom", skill_id: id, version: "latest" },
              { type: "anthropic", skill_id: "pptx", version: "latest" },
            ],
          },
          messages,
        },
        { timeout: HTTP_TIMEOUT_MS },
      )
    } catch (err) {
      const elapsedMs = Date.now() - callStarted
      if (is499(err)) {
        const line = {
          event: "http_499",
          mba,
          call,
          elapsed_ms: elapsedMs,
          last_tool_command: clipCommand(commandBeforeCall),
        }
        console.log(JSON.stringify(line))
        appendCallLog(mba, line)
        throw new Error(
          `HTTP 499 after ${elapsedMs}ms. Last tool command:\n${clipCommand(commandBeforeCall)}`,
        )
      }
      const status = err instanceof Anthropic.APIError ? err.status : undefined
      const line = {
        event: "http_error",
        mba,
        call,
        status: status ?? null,
        elapsed_ms: elapsedMs,
        message: err instanceof Error ? err.message : String(err),
        last_tool_command: clipCommand(commandBeforeCall),
      }
      console.log(JSON.stringify(line))
      appendCallLog(mba, line)
      throw err
    }

    const elapsedMs = Date.now() - callStarted
    containerId = response.container?.id ?? containerId
    addUsage(usage, response.usage)
    walkOutputs(response.content, fileIds, logs)
    stopReason = response.stop_reason ?? ""
    const inputTokens = response.usage.input_tokens
    const usageLine = {
      event: "usage",
      mba,
      call,
      continuation: call > 1,
      input_tokens: inputTokens,
      output_tokens: response.usage.output_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_write_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      stop_reason: stopReason,
      elapsed_ms: elapsedMs,
    }
    console.log(JSON.stringify(usageLine))
    appendCallLog(mba, usageLine)

    const breach = overInputCap(inputTokens, usage.input, caps)
    if (breach) {
      const reason = breach === "per_call"
        ? `input_tokens ${inputTokens} exceeds ANTHROPIC_SPIKE_MAX_INPUT ${caps.perCall}`
        : `cumulative input_tokens ${usage.input} exceeds ANTHROPIC_SPIKE_MAX_RUN_INPUT ${caps.perRun}`
      const line = {
        event: "guardrail",
        mba,
        call,
        breach,
        input_tokens: inputTokens,
        cumulative_input_tokens: usage.input,
        last_tool_command: clipCommand(commandBeforeCall),
      }
      console.log(JSON.stringify(line))
      appendCallLog(mba, line)
      throw new Error(`${reason}. Last tool command:\n${clipCommand(commandBeforeCall)}`)
    }

    commandBeforeCall = lastToolCommand(response.content) ?? commandBeforeCall
    if (stopReason !== "pause_turn") break
    if (continuations >= MAX_CONTINUATIONS) {
      const line = {
        event: "max_continuations",
        mba,
        continuations,
        last_tool_command: clipCommand(commandBeforeCall),
      }
      console.log(JSON.stringify(line))
      appendCallLog(mba, line)
      break
    }
    continuations += 1
    messages.push({
      role: "assistant",
      content: response.content as Anthropic.Beta.BetaMessageParam["content"],
    })
  }

  const pptxIds: string[] = []
  for (const fileId of fileIds) {
    const meta = await client.beta.files.retrieveMetadata(fileId, { betas: ["files-api-2025-04-14"] })
    if (meta.filename.toLowerCase().endsWith(".pptx")) pptxIds.push(fileId)
  }
  if (pptxIds.length === 0) {
    fs.mkdirSync(outDir, { recursive: true })
    fs.writeFileSync(path.join(outDir, `${mba}-container.log`), logs.join("\n"))
    throw new Error(
      `container wrote no pptx for ${mba}. stop_reason=${stopReason} file_ids=${[...fileIds].join(",") || "none"}`,
    )
  }

  const chosen = pptxIds[pptxIds.length - 1]
  const downloaded = await client.beta.files.download(chosen, { betas: ["files-api-2025-04-14"] })
  const bytes = Buffer.from(await downloaded.arrayBuffer())
  fs.mkdirSync(outDir, { recursive: true })
  const pptxPath = path.join(outDir, `${mba}.pptx`)
  fs.writeFileSync(pptxPath, bytes)
  fs.writeFileSync(path.join(outDir, `${mba}-container.log`), logs.join("\n"))

  const numberCheck = await checkDeckNumbers(pptxPath, deckJsonPath)
  const soffice = await localSoffice()
  const renders = await renderPngs(soffice, pptxPath, mba)
  const wallMs = Date.now() - started
  console.log(JSON.stringify({
    mba,
    wall_ms: wallMs,
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead,
    cache_write_tokens: usage.cacheWrite,
    pause_turn_count: continuations,
    stop_reason: stopReason,
    estimated_usd: Number(estimateUsd(usage).toFixed(4)),
    price_usd_per_mtok: { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
    model: reportModel(),
    soffice_in_container: sofficeUsed(logs),
    local_soffice: soffice,
    pptx: pptxPath,
    number_check_stray: numberCheck.stray,
    slide_count: numberCheck.slideCount,
    renders,
  }))
  return numberCheck.stray.length
}

async function main() {
  const model = reportModel()
  const targets = process.argv.slice(2)
  if (targets.length === 0) {
    throw new Error("Pass an mba number. Example: hema007")
  }
  console.log(JSON.stringify({
    model,
    http_timeout_ms: HTTP_TIMEOUT_MS,
    max_continuations: MAX_CONTINUATIONS,
    ...spikeInputCaps(),
  }))
  const client = spikeClient()
  const id = await skillId(client)
  console.log(JSON.stringify({ skill_id: id, version: "latest", input_block: "container_upload" }))
  let stray = 0
  for (const mba of targets) {
    stray += await runOne(client, id, mba)
  }
  if (stray > 0) throw new Error(`number check failed: ${stray} stray figure(s)`)
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exitCode = 1
})
