/**
 * sendHtmlEmail attachment and reply-to behaviour.
 * Requires Node 22+ with `--experimental-test-module-mocks`.
 */
import assert from "node:assert/strict"
import { mock, test } from "node:test"

import { mockModuleSkip } from "@/lib/test/mockModuleHarness"

const skip = mockModuleSkip()

const sendMock = mock.fn(async (_message: Record<string, unknown>) => [{ statusCode: 202 }])
const setApiKeyMock = mock.fn((_key: string) => undefined)

if (typeof mock.module === "function") {
  await mock.module("@sendgrid/mail", {
    defaultExport: {
      setApiKey: setApiKeyMock,
      send: sendMock,
    },
  })
}

const { sendHtmlEmail } = await import("../sendHtmlEmail")

const ORIGINAL_KEY = process.env.SENDGRID_API_KEY
const ORIGINAL_FROM = process.env.EMAIL_FROM

function useEmailEnv() {
  process.env.SENDGRID_API_KEY = "test-key"
  process.env.EMAIL_FROM = "reports@assembledmedia.com.au"
}

function restoreEmailEnv() {
  if (ORIGINAL_KEY == null) delete process.env.SENDGRID_API_KEY
  else process.env.SENDGRID_API_KEY = ORIGINAL_KEY
  if (ORIGINAL_FROM == null) delete process.env.EMAIL_FROM
  else process.env.EMAIL_FROM = ORIGINAL_FROM
}

test("sendHtmlEmail without attachments matches the previous payload", { skip }, async () => {
  sendMock.mock.resetCalls()
  useEmailEnv()
  try {
    await sendHtmlEmail({
      to: "ops@assembledmedia.com.au",
      subject: "Weekly digest",
      html: "<p>Hello</p>",
    })
  } finally {
    restoreEmailEnv()
  }

  assert.equal(sendMock.mock.calls.length, 1)
  const message = sendMock.mock.calls[0].arguments[0] as Record<string, unknown>
  assert.deepEqual(message, {
    to: "ops@assembledmedia.com.au",
    from: "reports@assembledmedia.com.au",
    subject: "Weekly digest",
    html: "<p>Hello</p>",
    text: "Hello",
  })
})

test("sendHtmlEmail passes one attachment and replyTo through to SendGrid", { skip }, async () => {
  sendMock.mock.resetCalls()
  useEmailEnv()
  const contentBase64 = Buffer.from("deck").toString("base64")
  try {
    await sendHtmlEmail({
      to: ["a@assembledmedia.com.au"],
      subject: "Campaign report",
      html: "<p>Report</p>",
      replyTo: "reports@assembledmedia.com.au",
      attachments: [
        {
          filename: "Penfold-report-2026-08.pptx",
          contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          contentBase64,
        },
      ],
    })
  } finally {
    restoreEmailEnv()
  }

  assert.equal(sendMock.mock.calls.length, 1)
  const message = sendMock.mock.calls[0].arguments[0] as {
    replyTo?: string
    attachments?: Array<{ content: string; filename: string; type: string; disposition: string }>
  }
  assert.equal(message.replyTo, "reports@assembledmedia.com.au")
  assert.deepEqual(message.attachments, [
    {
      content: contentBase64,
      filename: "Penfold-report-2026-08.pptx",
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      disposition: "attachment",
    },
  ])
})

test("sendHtmlEmail refuses attachments over 3 MB", { skip }, async () => {
  sendMock.mock.resetCalls()
  useEmailEnv()
  const contentBase64 = Buffer.alloc(3 * 1024 * 1024 + 1).toString("base64")
  try {
    await assert.rejects(
      () =>
        sendHtmlEmail({
          to: "ops@assembledmedia.com.au",
          subject: "Too big",
          html: "<p>No</p>",
          attachments: [
            {
              filename: "too-big.pptx",
              contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
              contentBase64,
            },
          ],
        }),
      /over the 3 MB limit/,
    )
  } finally {
    restoreEmailEnv()
  }
  assert.equal(sendMock.mock.calls.length, 0)
})
