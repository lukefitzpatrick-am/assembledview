import assert from "node:assert/strict"
import test from "node:test"

import { composeAssistantTurn, splitMarkdownBlocks } from "../chatTurnBlocks.js"

const CONFIRMED = [
  "Here's what this JCDecaux schedule already resolved.",
  "",
  "| Field | Value |",
  "| --- | --- |",
  "| Publisher | JCDecaux (92%) |",
  "| Media type | ooh |",
  "| Lines / panels / bursts | 106 / 12 / 8 |",
  "",
  "I'll ask about a few leftover columns.",
].join("\n")

test("splitMarkdownBlocks keeps prose and GFM tables as ordered blocks", () => {
  const blocks = splitMarkdownBlocks(CONFIRMED)
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["markdown", "table", "markdown"],
  )
  assert.equal(blocks[0]?.type, "markdown")
  if (blocks[0]?.type === "markdown") {
    assert.match(blocks[0].text, /already resolved/)
  }
  assert.equal(blocks[1]?.type, "table")
  if (blocks[1]?.type === "table") {
    assert.deepEqual(blocks[1].headers, ["Field", "Value"])
    assert.equal(blocks[1].rows[0]?.[0], "Publisher")
    assert.equal(blocks[1].rows[2]?.[1], "106 / 12 / 8")
  }
  assert.equal(blocks[2]?.type, "markdown")
  if (blocks[2]?.type === "markdown") {
    assert.match(blocks[2].text, /leftover columns/)
  }
})

test("composeAssistantTurn puts question cards after the first table, before trailing prose", () => {
  const turn = composeAssistantTurn({
    markdown: CONFIRMED,
    hasQuestions: true,
    hasFiles: true,
  })
  assert.deepEqual(
    turn.map((block) => block.type),
    ["markdown", "table", "questions", "markdown", "files"],
  )
})

test("composeAssistantTurn without a table still emits questions after the prose", () => {
  const turn = composeAssistantTurn({
    markdown: "Which campaign should this attach to?",
    hasQuestions: true,
    hasFiles: false,
  })
  assert.deepEqual(
    turn.map((block) => block.type),
    ["markdown", "questions"],
  )
})

test("composeAssistantTurn honours an explicit questions slot between blocks", () => {
  const turn = composeAssistantTurn({
    markdown: "Intro\n\n<!-- ava:questions -->\n\nOutro",
    hasQuestions: true,
    hasFiles: false,
  })
  assert.deepEqual(
    turn.map((block) => block.type),
    ["markdown", "questions", "markdown"],
  )
  assert.equal(turn[0]?.type, "markdown")
  if (turn[0]?.type === "markdown") assert.match(turn[0].text, /Intro/)
  assert.equal(turn[2]?.type, "markdown")
  if (turn[2]?.type === "markdown") assert.match(turn[2].text, /Outro/)
})
