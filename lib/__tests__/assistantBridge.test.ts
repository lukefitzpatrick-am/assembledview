/**
 * @vitest-environment jsdom
 * Note: run with tsx --test; jsdom may be unavailable — smoke via node CustomEvent polyfill.
 */
import assert from "node:assert/strict"
import test from "node:test"
import { openAvaChat, subscribeAvaChatOpen } from "../assistantBridge.js"

test("openAvaChat dispatches message to subscribers", () => {
  // Minimal window EventTarget for node test env
  if (typeof (globalThis as any).window === "undefined") {
    const target = new EventTarget()
    ;(globalThis as any).window = target
    ;(globalThis as any).CustomEvent = class CustomEvent extends Event {
      detail: unknown
      constructor(type: string, init?: { detail?: unknown }) {
        super(type)
        this.detail = init?.detail
      }
    }
  }

  let received: string | null = null
  const unsub = subscribeAvaChatOpen(({ message }) => {
    received = message
  })
  openAvaChat({ message: "  Write commentary  " })
  assert.equal(received, "Write commentary")
  openAvaChat({ message: "   " })
  assert.equal(received, "Write commentary")
  unsub()
})
