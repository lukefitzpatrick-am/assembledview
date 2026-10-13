/**
 * Build one campaign report deck with the av-campaign-report-v5 skill.
 *
 * node --env-file=.env.local --import tsx scripts/spikes/report-deck-skill/run-deck.ts hema007
 *
 * Requires ANTHROPIC_REPORT_MODEL and ANTHROPIC_REPORT_EFFORT (low, medium, or high).
 * Does not fall back to ANTHROPIC_MODEL and does not pick an effort default.
 * ANTHROPIC_SPIKE_MAX_INPUT (default 150000) applies to a pause_turn
 * continuation only. ANTHROPIC_SPIKE_MAX_RUN_INPUT (default 600000) applies
 * to the whole run. Each response is saved and its output files are
 * downloaded before either cap stops the next continuation.
 */
import { execFile } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import Anthropic, { toFile } from "@anthropic-ai/sdk"
import sharp from "sharp"
import { checkBrand } from "./brand-check"
import {
  clipCommand,
  containerSteps,
  HTTP_TIMEOUT_MS,
  lastToolCommand,
  MAX_CONTINUATIONS,
  overInputCap,
  spikeInputCaps,
  type ContainerStep,
} from "./deck-guardrails"
import { checkDeckNumbers } from "./number-check"
import { slimDeckPayload } from "./slim-deck-payload"
import {
  estimateUsd,
  PRICE_USD_PER_MTOK,
  reportEffort,
  reportModel,
  SPIKE_BETAS,
  spikeClient,
} from "./spike-client"

const execFileAsync = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, "../../..")
const outDir = path.join(here, "out")
const DISPLAY_TITLE = "av-campaign-report-v5"
const KIT = path.join(here, "kit", "assembled-brand-kit")

const USER_MESSAGE = [
  "The input files are report-data.json, Assembled-Media-Template-v5.potx, and three library photos.",
  "They are already in the container input directory. Do not fetch anything.",
  "Build the Assembled Media campaign performance report by following av-campaign-report-v5 exactly.",
  "Run summarise.py, write content.json, then build_report.py and check_deck.py.",
  "Do not view or open images. Do not read the skill scripts. Do not print files. Do not write your own build script.",
  "Use only the formatted strings in report-data.json, via the keys in content.json.",
  "Save the deck to $OUTPUT_DIR/<mbaNumber>.pptx.",
].join(" ")

const RESULT_BREACH_CHARS = 20_000
const COST_CAP_USD = 0.6

type LibraryPhoto = {
  id: string
  file: string
  theme: string
  orientation: string
}

function pickCoverPhotos(): LibraryPhoto[] {
  const index = JSON.parse(fs.readFileSync(path.join(KIT, "library", "index.json"), "utf8")) as LibraryPhoto[]
  const portrait = (theme: string) =>
    index
      .filter((photo) => photo.orientation === "portrait" && photo.theme === theme)
      .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
  const family = portrait("family-and-outdoors")
  const travel = portrait("road-trips-and-travel")
  const picked = [family[0], travel[0], family[1]].filter((photo): photo is LibraryPhoto => !!photo)
  if (picked.length < 3) throw new Error("need 3 portrait photos from family-and-outdoors and road-trips-and-travel")
  return picked
}

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
  throw new Error("custom skill av-campaign-report-v5 is not uploaded")
}

function sofficeUsed(logs: string[]): boolean {
  const text = logs.join("\n")
  if (!/soffice/.test(text)) return false
  if (/soffice: not found|No such file or directory: ['"]?soffice|which: no soffice/.test(text)) return false
  return true
}

function localSoffice(): string | null {
  const candidates = [
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

async function contactSheet(slides: string[], dest: string): Promise<void> {
  const cols = 4
  const thumbW = 320
  const gap = 8
  const first = await sharp(slides[0]).metadata()
  const thumbH = Math.max(1, Math.round(thumbW * ((first.height ?? 1) / (first.width ?? 1))))
  const rows = Math.ceil(slides.length / cols)
  const width = cols * thumbW + (cols + 1) * gap
  const height = rows * thumbH + (rows + 1) * gap
  const composites = []
  for (let i = 0; i < slides.length; i += 1) {
    const input = await sharp(slides[i]).resize(thumbW, thumbH).png().toBuffer()
    const col = i % cols
    const row = Math.floor(i / cols)
    composites.push({
      input,
      left: gap + col * (thumbW + gap),
      top: gap + row * (thumbH + gap),
    })
  }
  await sharp({
    create: { width, height, channels: 3, background: { r: 239, g: 233, b: 223 } },
  })
    .composite(composites)
    .png()
    .toFile(dest)
}

function localPdftoppm(): string {
  const root = path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WinGet", "Packages")
  const found: string[] = []
  const walk = (dir: string, depth: number) => {
    if (depth > 6 || !fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isFile() && entry.name.toLowerCase() === "pdftoppm.exe") found.push(full)
      else if (entry.isDirectory()) walk(full, depth + 1)
    }
  }
  walk(root, 0)
  return found[0] ?? "pdftoppm"
}

async function renderSlides(
  soffice: string | null,
  pptxPath: string,
  stem: string,
): Promise<{ slides: string[]; sheet: string | null }> {
  if (!soffice) return { slides: [], sheet: null }
  const pdfPath = path.join(outDir, `${stem}.pdf`)
  const profile = `file:///${path.join(os.tmpdir(), `lo-${stem}`).replace(/\\/g, "/")}`
  await execFileAsync(soffice, [
    "--headless",
    "--norestore",
    "--nolockcheck",
    `--env:UserInstallation=${profile}`,
    "--convert-to",
    "pdf",
    "--outdir",
    outDir,
    pptxPath,
  ])
  const slideDir = path.join(outDir, stem)
  fs.mkdirSync(slideDir, { recursive: true })
  await execFileAsync(localPdftoppm(), ["-png", "-r", "40", pdfPath, path.join(slideDir, "slide")])
  const numbered = fs
    .readdirSync(slideDir)
    .filter((name) => /^slide-?\d+\.png$/.test(name))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const slides: string[] = []
  for (const name of numbered) {
    const num = Number(name.match(/(\d+)/)?.[1] ?? "0")
    const dest = path.join(slideDir, `slide-${String(num).padStart(2, "0")}.png`)
    const src = path.join(slideDir, name)
    if (src !== dest) fs.renameSync(src, dest)
    slides.push(dest)
  }
  if (slides.length === 0) return { slides, sheet: null }
  const sheet = path.join(outDir, `${stem}-sheet.png`)
  await contactSheet(slides, sheet)
  return { slides, sheet }
}

function is499(err: unknown): boolean {
  return err instanceof Anthropic.APIError && err.status === 499
}

function appendCallLog(mba: string, line: unknown): void {
  fs.mkdirSync(outDir, { recursive: true })
  fs.appendFileSync(path.join(outDir, `${mba}-calls.jsonl`), `${JSON.stringify(line)}\n`)
}

function saveCallResponse(mba: string, call: number, response: unknown): void {
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, `${mba}-call${call}.json`), `${JSON.stringify(response, null, 2)}\n`)
}

function printSteps(mba: string, call: number, steps: ContainerStep[]): void {
  console.log(`steps mba=${mba} call=${call} count=${steps.length}`)
  for (const step of steps) {
    const command = step.command.length > 200 ? `${step.command.slice(0, 200)}…` : step.command
    console.log(
      [
        String(step.step).padStart(3),
        step.tool.padEnd(32),
        String(step.resultChars).padStart(8),
        step.resultChars > RESULT_BREACH_CHARS ? "BREACH" : step.errored ? "error" : "ok   ",
        command,
      ].join("  "),
    )
  }
  const breaches = steps.filter((step) => step.resultChars > RESULT_BREACH_CHARS)
  if (breaches.length > 0) {
    const line = {
      event: "result_breach",
      mba,
      call,
      limit: RESULT_BREACH_CHARS,
      steps: breaches.map((step) => ({ step: step.step, tool: step.tool, resultChars: step.resultChars })),
    }
    console.log(JSON.stringify(line))
    appendCallLog(mba, line)
  }
  const largest = [...steps].sort((a, b) => b.resultChars - a.resultChars).slice(0, 5)
  const line = {
    event: "largest_results",
    mba,
    call,
    results: largest.map((step) => ({
      step: step.step,
      tool: step.tool,
      resultChars: step.resultChars,
      errored: step.errored,
      result: step.resultText.length > 4000 ? `${step.resultText.slice(0, 4000)}…` : step.resultText,
    })),
  }
  console.log(JSON.stringify(line))
  appendCallLog(mba, line)
}

async function downloadOutputs(
  client: Anthropic,
  mba: string,
  call: number,
  fileIds: Set<string>,
  seen: Set<string>,
): Promise<void> {
  fs.mkdirSync(outDir, { recursive: true })
  for (const fileId of fileIds) {
    if (seen.has(fileId)) continue
    try {
      const meta = await client.beta.files.retrieveMetadata(fileId, { betas: ["files-api-2025-04-14"] })
      const downloaded = await client.beta.files.download(fileId, { betas: ["files-api-2025-04-14"] })
      const bytes = Buffer.from(await downloaded.arrayBuffer())
      const safe = meta.filename.replace(/[^\w.\-]+/g, "_") || fileId
      const dest = path.join(outDir, `${mba}-call${call}-${safe}`)
      fs.writeFileSync(dest, bytes)
      seen.add(fileId)
      if (meta.filename.toLowerCase().endsWith(".pptx")) {
        fs.writeFileSync(path.join(outDir, `${mba}.pptx`), bytes)
      }
      const line = {
        event: "download",
        mba,
        call,
        file_id: fileId,
        filename: meta.filename,
        bytes: bytes.length,
        path: dest,
      }
      console.log(JSON.stringify(line))
      appendCallLog(mba, line)
    } catch (err) {
      const line = {
        event: "download_error",
        mba,
        call,
        file_id: fileId,
        message: err instanceof Error ? err.message : String(err),
      }
      console.log(JSON.stringify(line))
      appendCallLog(mba, line)
    }
  }
}

async function runOne(client: Anthropic, id: string, mba: string): Promise<number> {
  const stem = `${mba}-v5`
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
  const deckJsonPath = path.join(outDir, `${stem}-report-data.json`)
  fs.writeFileSync(deckJsonPath, deckJson)
  console.log(JSON.stringify({ mba, deck_payload_bytes: deckBytes, deck_payload: deckJsonPath }))

  const started = Date.now()
  const photos = pickCoverPhotos()
  console.log(JSON.stringify({
    mba,
    photo_ids: photos.map((photo) => photo.id),
    photo_themes: photos.map((photo) => photo.theme),
  }))
  const templatePath = path.join(KIT, "templates", "Assembled-Media-Template-v5.potx")
  const [reportFile, templateFile, ...photoFiles] = await Promise.all([
    toFile(Buffer.from(deckJson), "report-data.json", { type: "application/json" }),
    toFile(fs.readFileSync(templatePath), "Assembled-Media-Template-v5.potx", {
      type: "application/vnd.openxmlformats-officedocument.presentationml.template",
    }),
    ...photos.map((photo) =>
      toFile(fs.readFileSync(path.join(KIT, photo.file)), path.basename(photo.file), {
        type: "image/jpeg",
      }),
    ),
  ])
  const [uploaded, template, ...uploadedPhotos] = await Promise.all([
    client.beta.files.upload({ file: reportFile, betas: ["files-api-2025-04-14"] }),
    client.beta.files.upload({ file: templateFile, betas: ["files-api-2025-04-14"] }),
    ...photoFiles.map((file) => client.beta.files.upload({ file, betas: ["files-api-2025-04-14"] })),
  ])
  console.log(JSON.stringify({
    mba,
    input_block: "container_upload",
    input_file_id: uploaded.id,
    input_filename: uploaded.filename,
    template_file_id: template.id,
    template_filename: template.filename,
    photo_file_ids: uploadedPhotos.map((photo, index) => ({
      library_id: photos[index]?.id,
      file_id: photo.id,
      filename: photo.filename,
    })),
  }))

  const messages: Anthropic.Beta.BetaMessageParam[] = [
    {
      role: "user",
      content: [
        { type: "container_upload", file_id: uploaded.id },
        { type: "container_upload", file_id: template.id },
        ...uploadedPhotos.map((photo) => ({ type: "container_upload" as const, file_id: photo.id })),
        { type: "text", text: USER_MESSAGE, cache_control: { type: "ephemeral" } },
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
  const seenFiles = new Set<string>()
  const model = reportModel()
  const effort = reportEffort()
  const outputConfig: Anthropic.Beta.BetaOutputConfig = { effort }

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
            skills: [{ type: "custom", skill_id: id, version: "latest" }],
          },
          output_config: outputConfig,
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
        }
        console.log(JSON.stringify(line))
        appendCallLog(stem, line)
        throw new Error(`HTTP 499 after ${elapsedMs}ms.`)
      }
      const status = err instanceof Anthropic.APIError ? err.status : undefined
      const line = {
        event: "http_error",
        mba,
        call,
        status: status ?? null,
        elapsed_ms: elapsedMs,
        message: err instanceof Error ? err.message : String(err),
      }
      console.log(JSON.stringify(line))
      appendCallLog(stem, line)
      throw err
    }

    const elapsedMs = Date.now() - callStarted
    saveCallResponse(stem, call, response)
    containerId = response.container?.id ?? containerId
    addUsage(usage, response.usage)
    walkOutputs(response.content, fileIds, logs)
    await downloadOutputs(client, stem, call, fileIds, seenFiles)
    const steps = containerSteps(response.content)
    printSteps(stem, call, steps)
    const lastCommand = steps.length
      ? steps[steps.length - 1].command
      : lastToolCommand(response.content)
    stopReason = response.stop_reason ?? ""
    const inputTokens = response.usage.input_tokens
    const continuation = call > 1
    const callUsage = {
      input: inputTokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
      cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
    }
    const usageLine = {
      event: "usage",
      mba,
      model,
      effort,
      call,
      continuation,
      input_tokens: callUsage.input,
      output_tokens: callUsage.output,
      cache_read_input_tokens: callUsage.cacheRead,
      cache_write_input_tokens: callUsage.cacheWrite,
      call_cost_usd: Number(estimateUsd(callUsage).toFixed(4)),
      run_cost_usd: Number(estimateUsd(usage).toFixed(4)),
      stop_reason: stopReason,
      elapsed_ms: elapsedMs,
    }
    console.log(JSON.stringify(usageLine))
    appendCallLog(stem, usageLine)

    const breach = overInputCap(inputTokens, usage.input, caps, continuation)
    if (breach) {
      const reason = breach === "per_call"
        ? `continuation input_tokens ${inputTokens} exceeds ANTHROPIC_SPIKE_MAX_INPUT ${caps.perCall}`
        : `cumulative input_tokens ${usage.input} exceeds ANTHROPIC_SPIKE_MAX_RUN_INPUT ${caps.perRun}`
      const line = {
        event: "guardrail",
        mba,
        call,
        breach,
        continuation,
        input_tokens: inputTokens,
        cumulative_input_tokens: usage.input,
        last_tool_command: clipCommand(lastCommand),
      }
      console.log(JSON.stringify(line))
      appendCallLog(stem, line)
      throw new Error(`${reason}. Last tool command:\n${clipCommand(lastCommand)}`)
    }

    if (stopReason !== "pause_turn") break
    if (estimateUsd(usage) > COST_CAP_USD) {
      const line = {
        event: "cost_cap",
        mba,
        call,
        run_cost_usd: Number(estimateUsd(usage).toFixed(4)),
        cap_usd: COST_CAP_USD,
        rerun: false,
      }
      console.log(JSON.stringify(line))
      appendCallLog(stem, line)
      break
    }
    if (continuations >= MAX_CONTINUATIONS) {
      const line = {
        event: "max_continuations",
        mba,
        continuations,
        last_tool_command: clipCommand(lastCommand),
      }
      console.log(JSON.stringify(line))
      appendCallLog(stem, line)
      break
    }
    continuations += 1
    messages.push({
      role: "assistant",
      content: response.content as Anthropic.Beta.BetaMessageParam["content"],
    })
  }

  const pptxPath = path.join(outDir, `${stem}.pptx`)
  fs.mkdirSync(outDir, { recursive: true })
  fs.writeFileSync(path.join(outDir, `${stem}-container.log`), logs.join("\n"))
  if (!fs.existsSync(pptxPath)) {
    throw new Error(
      `container wrote no pptx for ${mba}. stop_reason=${stopReason} file_ids=${[...fileIds].join(",") || "none"}`,
    )
  }

  const numberCheck = await checkDeckNumbers(pptxPath, deckJsonPath)
  const brand = await checkBrand(pptxPath)
  const soffice = await localSoffice()
  const renders = await renderSlides(soffice, pptxPath, stem)
  const wallMs = Date.now() - started
  const runCost = Number(estimateUsd(usage).toFixed(4))
  console.log(JSON.stringify({
    mba,
    wall_ms: wallMs,
    input_tokens: usage.input,
    output_tokens: usage.output,
    cache_read_tokens: usage.cacheRead,
    cache_write_tokens: usage.cacheWrite,
    pause_turn_count: continuations,
    stop_reason: stopReason,
    estimated_usd: runCost,
    run_cost_usd: runCost,
    price_usd_per_mtok: PRICE_USD_PER_MTOK,
    model: reportModel(),
    soffice_in_container: sofficeUsed(logs),
    local_soffice: soffice,
    pptx: pptxPath,
    number_check_stray: numberCheck.stray,
    slide_count: numberCheck.slideCount,
    brand_failures: brand,
    slides: renders.slides,
    contact_sheet: renders.sheet,
  }))
  if (runCost > COST_CAP_USD) {
    console.log(JSON.stringify({ event: "cost_cap", mba, run_cost_usd: runCost, cap_usd: COST_CAP_USD, rerun: false }))
  }
  return numberCheck.stray.length
}

async function main() {
  const model = reportModel()
  const effort = reportEffort()
  const targets = process.argv.slice(2)
  if (targets.length === 0) {
    throw new Error("Pass an mba number. Example: hema007")
  }
  if (targets.some((mba) => mba.toLowerCase() === "curatif004")) {
    throw new Error("curatif004 is not part of this run")
  }
  const caps = spikeInputCaps()
  console.log(JSON.stringify({
    model,
    effort,
    http_timeout_ms: HTTP_TIMEOUT_MS,
    max_continuations: MAX_CONTINUATIONS,
    continuation_input_cap: caps.perCall,
    run_input_cap: caps.perRun,
  }))
  const client = spikeClient()
  const id = await skillId(client)
  console.log(JSON.stringify({
    skill_id: id,
    version: "latest",
    input_block: "container_upload",
    fonts: "bundled in the skill",
    fonts_reason: "five font files stay on the skill filesystem and are not prompt tokens unless read; container_upload would add five user-message blocks",
  }))
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
