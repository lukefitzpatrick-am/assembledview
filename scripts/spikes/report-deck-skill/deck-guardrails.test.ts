import assert from "node:assert/strict"
import test from "node:test"
import { clipCommand, lastToolCommand, overInputCap, spikeInputCaps } from "./deck-guardrails"
import { reportEffort, reportModel } from "./spike-client"

test("last tool command is the latest code or command field", () => {
  const content = [
    { type: "text", text: "inspect" },
    { type: "tool_use", name: "code_execution", input: { code: "print('first')" } },
    { type: "tool_use", name: "bash", input: { command: "unzip -p slide1.xml | head -c 4000" } },
  ]
  assert.equal(lastToolCommand(content), "unzip -p slide1.xml | head -c 4000")
  assert.equal(lastToolCommand([]), null)
  assert.match(clipCommand("x".repeat(5000)), /truncated 1000 chars/)
})

test("input caps use the documented defaults and abort after either limit", () => {
  const previousCall = process.env.ANTHROPIC_SPIKE_MAX_INPUT
  const previousRun = process.env.ANTHROPIC_SPIKE_MAX_RUN_INPUT
  delete process.env.ANTHROPIC_SPIKE_MAX_INPUT
  delete process.env.ANTHROPIC_SPIKE_MAX_RUN_INPUT
  assert.deepEqual(spikeInputCaps(), { perCall: 150_000, perRun: 600_000 })
  const caps = spikeInputCaps()
  assert.equal(overInputCap(150_000, 150_000, caps), null)
  assert.equal(overInputCap(150_001, 150_001, caps), "per_call")
  assert.equal(overInputCap(1, 600_001, caps), "per_run")
  if (previousCall === undefined) delete process.env.ANTHROPIC_SPIKE_MAX_INPUT
  else process.env.ANTHROPIC_SPIKE_MAX_INPUT = previousCall
  if (previousRun === undefined) delete process.env.ANTHROPIC_SPIKE_MAX_RUN_INPUT
  else process.env.ANTHROPIC_SPIKE_MAX_RUN_INPUT = previousRun
})

test("report model is ANTHROPIC_REPORT_MODEL only", () => {
  const previousReport = process.env.ANTHROPIC_REPORT_MODEL
  const previousModel = process.env.ANTHROPIC_MODEL
  delete process.env.ANTHROPIC_REPORT_MODEL
  process.env.ANTHROPIC_MODEL = "claude-opus-5-5"
  assert.throws(() => reportModel(), /ANTHROPIC_REPORT_MODEL is unset/)
  process.env.ANTHROPIC_REPORT_MODEL = "claude-sonnet-5"
  assert.equal(reportModel(), "claude-sonnet-5")
  if (previousReport === undefined) delete process.env.ANTHROPIC_REPORT_MODEL
  else process.env.ANTHROPIC_REPORT_MODEL = previousReport
  if (previousModel === undefined) delete process.env.ANTHROPIC_MODEL
  else process.env.ANTHROPIC_MODEL = previousModel
})

test("report effort is ANTHROPIC_REPORT_EFFORT only", () => {
  const previous = process.env.ANTHROPIC_REPORT_EFFORT
  delete process.env.ANTHROPIC_REPORT_EFFORT
  assert.throws(() => reportEffort(), /ANTHROPIC_REPORT_EFFORT is unset/)
  process.env.ANTHROPIC_REPORT_EFFORT = "max"
  assert.throws(() => reportEffort(), /must be low, medium, or high/)
  process.env.ANTHROPIC_REPORT_EFFORT = "high"
  assert.equal(reportEffort(), "high")
  if (previous === undefined) delete process.env.ANTHROPIC_REPORT_EFFORT
  else process.env.ANTHROPIC_REPORT_EFFORT = previous
})
