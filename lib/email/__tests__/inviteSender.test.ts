/**
 * Invite email: SendGrid only (no SMTP fallback since 31 Oct 2026).
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const sendMock = mock.fn(async (_message: Record<string, unknown>) => [{ statusCode: 202 }])
const setApiKeyMock = mock.fn((_key: string) => undefined)

if (typeof mock.module === "function") {
  await mock.module("@sendgrid/mail", {
    defaultExport: { setApiKey: setApiKeyMock, send: sendMock },
  })
}

const { sendInviteEmail, INVITE_EMAIL_NOT_CONFIGURED } = await import("../inviteSender")

const PARAMS = { to: "new.user@example.com", firstName: "Sam", lastName: "Lee", ticketUrl: "https://auth.example/t/1" }

function withEnv(env: Record<string, string | undefined>, fn: () => Promise<void>) {
  const keys = ["SENDGRID_API_KEY", "EMAIL_FROM", "SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"]
  const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]))
  for (const k of keys) delete process.env[k]
  Object.assign(process.env, env)
  return fn().finally(() => {
    for (const k of keys) {
      if (saved[k] == null) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })
}

test("sends through SendGrid with the branded subject, text and html", { skip }, async () => {
  sendMock.mock.resetCalls()
  await withEnv({ SENDGRID_API_KEY: "test-key", EMAIL_FROM: "noreply@assembledmedia.com.au" }, async () => {
    await sendInviteEmail(PARAMS)
  })
  assert.equal(setApiKeyMock.mock.calls.at(-1)?.arguments[0], "test-key")
  const msg = sendMock.mock.calls.at(-1)?.arguments[0] as Record<string, string>
  assert.equal(msg.to, "new.user@example.com")
  assert.equal(msg.from, "noreply@assembledmedia.com.au")
  assert.equal(msg.subject, "You've been invited to AssembledView")
  assert.match(msg.text, /https:\/\/auth\.example\/t\/1/)
  assert.match(msg.html, /Set your password/)
})

test("no SendGrid key is a clear error, even with SMTP settings present (no fallback)", { skip }, async () => {
  sendMock.mock.resetCalls()
  await withEnv(
    { EMAIL_FROM: "x@y.z", SMTP_HOST: "smtp.example", SMTP_PORT: "587", SMTP_USER: "u", SMTP_PASS: "p" },
    async () => {
      await assert.rejects(() => sendInviteEmail(PARAMS), (e: Error) => e.message === INVITE_EMAIL_NOT_CONFIGURED)
    },
  )
  assert.equal(sendMock.mock.callCount(), 0)
  assert.match(INVITE_EMAIL_NOT_CONFIGURED, /SENDGRID_API_KEY/)
})

test("nodemailer is gone from the sender and from package.json", () => {
  const src = readFileSync(new URL("../inviteSender.ts", import.meta.url), "utf8")
  assert.doesNotMatch(src, /nodemailer|SMTP_HOST/)
  const pkg = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8"))
  assert.equal(pkg.dependencies?.nodemailer, undefined)
  assert.equal(pkg.devDependencies?.nodemailer, undefined)
})
