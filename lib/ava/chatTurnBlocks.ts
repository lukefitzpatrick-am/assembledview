export type ChatMarkdownBlock = {
  type: "markdown"
  text: string
}

export type ChatTableBlock = {
  type: "table"
  headers: string[]
  rows: string[][]
  alignments: Array<"left" | "right" | "center">
}

export type ChatContentBlock = ChatMarkdownBlock | ChatTableBlock

export type ChatTurnBlock =
  | ChatContentBlock
  | { type: "questions" }
  | { type: "files" }

const QUESTIONS_SLOT = "<!-- ava:questions -->"
const FILES_SLOT = "<!-- ava:files -->"

function splitPipeRow(line: string): string[] {
  const trimmed = line.trim()
  const inner =
    trimmed.startsWith("|") && trimmed.endsWith("|")
      ? trimmed.slice(1, -1)
      : trimmed.startsWith("|")
        ? trimmed.slice(1)
        : trimmed
  return inner.split("|").map((cell) => cell.trim())
}

function isSeparatorRow(line: string): boolean {
  const cells = splitPipeRow(line)
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function looksLikeTableRow(line: string): boolean {
  const trimmed = line.trim()
  return trimmed.startsWith("|") && trimmed.includes("|", 1)
}

function parseAlignment(cell: string): "left" | "right" | "center" {
  const starts = cell.startsWith(":")
  const ends = cell.endsWith(":")
  if (starts && ends) return "center"
  if (ends) return "right"
  return "left"
}

function flushMarkdown(chunks: string[], into: ChatContentBlock[]) {
  const text = chunks.join("\n").trim()
  chunks.length = 0
  if (!text) return
  into.push({ type: "markdown", text })
}

export function splitMarkdownBlocks(markdown: string): ChatContentBlock[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n")
  const blocks: ChatContentBlock[] = []
  const prose: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ""
    const next = lines[i + 1]
    if (looksLikeTableRow(line) && typeof next === "string" && isSeparatorRow(next)) {
      flushMarkdown(prose, blocks)
      const headers = splitPipeRow(line)
      const alignments = splitPipeRow(next).map(parseAlignment)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && looksLikeTableRow(lines[i] ?? "") && !isSeparatorRow(lines[i] ?? "")) {
        rows.push(splitPipeRow(lines[i] ?? ""))
        i++
      }
      i--
      blocks.push({
        type: "table",
        headers,
        rows,
        alignments: headers.map((_, idx) => alignments[idx] ?? "left"),
      })
      continue
    }
    prose.push(line)
  }

  flushMarkdown(prose, blocks)
  return blocks
}

function splitOnSlot(
  blocks: ChatContentBlock[],
  slot: string,
): { before: ChatContentBlock[]; after: ChatContentBlock[]; found: boolean } {
  const before: ChatContentBlock[] = []
  const after: ChatContentBlock[] = []
  let found = false
  for (const block of blocks) {
    if (found) {
      after.push(block)
      continue
    }
    if (block.type !== "markdown" || !block.text.includes(slot)) {
      before.push(block)
      continue
    }
    found = true
    const [head, ...rest] = block.text.split(slot)
    const tail = rest.join(slot)
    if (head?.trim()) before.push({ type: "markdown", text: head.trim() })
    if (tail.trim()) after.push({ type: "markdown", text: tail.trim() })
  }
  return { before, after, found }
}

export function composeAssistantTurn(input: {
  markdown: string
  hasQuestions?: boolean
  hasFiles?: boolean
}): ChatTurnBlock[] {
  const content = splitMarkdownBlocks(input.markdown)
  const questions = Boolean(input.hasQuestions)
  const files = Boolean(input.hasFiles)
  const out: ChatTurnBlock[] = []

  const questionSplit = questions
    ? splitOnSlot(content, QUESTIONS_SLOT)
    : { before: content, after: [] as ChatContentBlock[], found: false }

  const insertQuestions = () => {
    if (questions) out.push({ type: "questions" })
  }

  if (questionSplit.found) {
    out.push(...questionSplit.before)
    insertQuestions()
    out.push(...questionSplit.after)
  } else {
    const firstTable = questionSplit.before.findIndex((block) => block.type === "table")
    if (questions && firstTable >= 0) {
      out.push(...questionSplit.before.slice(0, firstTable + 1))
      insertQuestions()
      out.push(...questionSplit.before.slice(firstTable + 1))
    } else {
      out.push(...questionSplit.before)
      insertQuestions()
    }
  }

  if (files) {
    const fileSplit = splitOnSlot(
      out.filter((block): block is ChatContentBlock => block.type === "markdown" || block.type === "table"),
      FILES_SLOT,
    )
    if (fileSplit.found) {
      // Rebuild with files slot — rare; default is append.
      const rebuilt: ChatTurnBlock[] = []
      for (const block of out) {
        if (block.type === "markdown" && block.text.includes(FILES_SLOT)) {
          const [head, ...rest] = block.text.split(FILES_SLOT)
          if (head?.trim()) rebuilt.push({ type: "markdown", text: head.trim() })
          rebuilt.push({ type: "files" })
          const tail = rest.join(FILES_SLOT).trim()
          if (tail) rebuilt.push({ type: "markdown", text: tail })
        } else {
          rebuilt.push(block)
        }
      }
      return rebuilt
    }
    out.push({ type: "files" })
  }

  return out.filter((block) => {
    if (block.type === "markdown") return block.text.trim().length > 0
    return true
  })
}
