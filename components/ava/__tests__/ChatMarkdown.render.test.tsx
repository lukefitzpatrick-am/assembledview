/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import { ChatAssistantMarkdown } from "../ChatAssistantMarkdown"
import { ChatAssistantTurn } from "../ChatAssistantTurn"
import { ChatUserMessage } from "../ChatUserMessage"

const TABLE_MD = [
  "Here's what this JCDecaux schedule already resolved.",
  "",
  "| Field | Count |",
  "| --- | --- |",
  "| Lines | 106 |",
  "| Panels | 12 |",
  "",
  "I'll ask about a few leftover columns.",
].join("\n")

const WIDE_TABLE = [
  "| A | B | C | D | E | F | G | H |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "| very-long-publisher-name-that-should-not-widen-the-panel | 1 | 2 | 3 | 4 | 5 | 6 | 7 |",
].join("\n")

describe("ChatAssistantMarkdown", () => {
  it("renders a GFM table as a real table", () => {
    const html = renderToStaticMarkup(<ChatAssistantMarkdown markdown={TABLE_MD} />)
    expect(html).toContain("<table")
    expect(html).toContain("<th")
    expect(html).toContain("Lines")
    expect(html).toContain("106")
  })

  it("does not pass raw HTML through", () => {
    const html = renderToStaticMarkup(
      <ChatAssistantMarkdown markdown={'Hello <img src=x onerror="alert(1)"> **world**'} />,
    )
    expect(html.toLowerCase()).not.toMatch(/<img\b/)
    expect(html).toContain("&lt;img")
    expect(html).toMatch(/<strong\b/)
    expect(html).toContain("world")
  })

  it("right-aligns numeric columns with tabular figures", () => {
    const html = renderToStaticMarkup(<ChatAssistantMarkdown markdown={TABLE_MD} />)
    expect(html).toMatch(/text-right[^"]*num|num[^"]*text-right/)
    expect(html).toContain("106")
  })
})

describe("ChatUserMessage", () => {
  it("renders user markdown syntax literally", () => {
    const html = renderToStaticMarkup(
      <ChatUserMessage content={"**not bold**\n| Field | Value |\n| --- | --- |\n| A | 1 |"} />,
    )
    expect(html).toContain("**not bold**")
    expect(html).not.toContain("<strong>")
    expect(html).not.toContain("<table")
    expect(html).toContain("| Field | Value |")
  })
})

describe("ChatAssistantTurn", () => {
  it("preserves multi-block order: prose, table, questions, trailing prose, files", () => {
    const html = renderToStaticMarkup(
      <ChatAssistantTurn
        markdown={TABLE_MD}
        questionsSlot={<span data-block="questions">Q</span>}
        filesSlot={<span data-block="files">F</span>}
      />,
    )
    const resolved = html.indexOf("already resolved")
    const table = html.indexOf("<table")
    const questions = html.indexOf('data-block="questions"')
    const trailing = html.indexOf("leftover columns")
    const files = html.indexOf('data-block="files"')
    expect(resolved).toBeGreaterThan(-1)
    expect(table).toBeGreaterThan(resolved)
    expect(questions).toBeGreaterThan(table)
    expect(trailing).toBeGreaterThan(questions)
    expect(files).toBeGreaterThan(trailing)
  })

  it("keeps a long table inside a horizontal scroll container at w-80", () => {
    const html = renderToStaticMarkup(
      <div className="w-80 overflow-x-hidden">
        <ChatAssistantTurn markdown={WIDE_TABLE} />
      </div>,
    )
    expect(html).toContain("overflow-x-auto")
    expect(html).toContain("min-w-0")
    expect(html).toContain("<table")
    expect(html).not.toContain("whitespace-pre-line")
  })
})
