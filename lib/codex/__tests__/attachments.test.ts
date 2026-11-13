import assert from "node:assert/strict"
import { test } from "node:test"

import {
  ATTACHMENT_MAX_BYTES,
  attachmentBlobPathname,
  attachmentHost,
  canDeleteAttachment,
  checkAttachmentFile,
  cleanAttachmentName,
  formatAttachmentSize,
  isTaskBlobPathname,
  parseAttachmentLink,
} from "../attachments"

test("file: type by extension, size limit, empty refused", () => {
  const ok = checkAttachmentFile({ name: "C:\\proofs\\KRUS014 OOH.PDF", size: 1000 })
  assert.deepEqual(ok, { ok: true, name: "KRUS014 OOH.PDF", contentType: "application/pdf", sizeBytes: 1000 })
  assert.equal(checkAttachmentFile({ name: "a.svg", size: 10 }).ok, false)
  assert.equal(checkAttachmentFile({ name: "a.html", size: 10 }).ok, false)
  assert.equal(checkAttachmentFile({ name: "noext", size: 10 }).ok, false)
  const big = checkAttachmentFile({ name: "a.pdf", size: ATTACHMENT_MAX_BYTES + 1 })
  assert.equal(big.ok ? "" : big.error, "attachment_too_large")
  assert.equal(checkAttachmentFile({ name: "a.pdf", size: ATTACHMENT_MAX_BYTES }).ok, true)
  const empty = checkAttachmentFile({ name: "a.pdf", size: 0 })
  assert.equal(empty.ok ? "" : empty.error, "file_empty")
  assert.equal(checkAttachmentFile(null).ok, false)
})

test("names: folders and control characters dropped, long names keep the extension", () => {
  assert.equal(cleanAttachmentName("a/b/c\u0007  d.png"), "c d.png")
  const long = cleanAttachmentName(`${"x".repeat(300)}.xlsx`)
  assert.equal(long.length, 200)
  assert.ok(long.endsWith(".xlsx"))
})

test("blob pathname is inside the task's folder and checked on the way out", () => {
  assert.equal(attachmentBlobPathname(7, "My file (v2).pdf"), "codex/tasks/7/My_file_v2_.pdf")
  assert.equal(isTaskBlobPathname(7, "codex/tasks/7/x.pdf"), true)
  assert.equal(isTaskBlobPathname(7, "codex/tasks/70/x.pdf"), false)
  assert.equal(isTaskBlobPathname(7, "codex/tasks/7/../8/x.pdf"), false)
  assert.equal(isTaskBlobPathname(7, null), false)
})

test("links: http(s) only, a host, no credentials; host shown", () => {
  const ok = parseAttachmentLink({ url: " https://AssembledMedia.SharePoint.com/sites/x/doc.pdf ", name: "" })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    assert.equal(ok.host, "assembledmedia.sharepoint.com")
    assert.equal(ok.name, "doc.pdf")
  }
  const bad = parseAttachmentLink({ url: "https://example.com/a%E0%A4%A" })
  assert.equal(bad.ok, true)
  const root = parseAttachmentLink({ url: "https://example.com/" })
  assert.equal(root.ok && root.name, "example.com")
  const named = parseAttachmentLink({ url: "http://example.com", name: "Brief" })
  assert.equal(named.ok && named.name, "Brief")
  for (const url of ["javascript:alert(1)", "data:text/html,x", "ftp://x.com/a", "https://u:p@x.com/", "https://localhost/", "not a url", ""]) {
    assert.equal(parseAttachmentLink({ url }).ok, false, url)
  }
  assert.equal(parseAttachmentLink({ url: `https://x.com/${"a".repeat(2000)}` }).ok, false)
  assert.equal(attachmentHost("https://Docs.Example.com/a"), "docs.example.com")
  assert.equal(attachmentHost("nope"), null)
})

test("delete: the uploader or an admin", () => {
  const att = { uploaded_by_email: "Mia@X.au" }
  assert.equal(canDeleteAttachment(att, "mia@x.au", []), true)
  assert.equal(canDeleteAttachment(att, "ellie@x.au", []), false)
  assert.equal(canDeleteAttachment(att, "ellie@x.au", ["admin"]), true)
  assert.equal(canDeleteAttachment(att, "", ["client"]), false)
})

test("sizes read in words", () => {
  assert.equal(formatAttachmentSize(500), "500 B")
  assert.equal(formatAttachmentSize(2048), "2 KB")
  assert.equal(formatAttachmentSize(1.5 * 1024 * 1024), "1.5 MB")
  assert.equal(formatAttachmentSize(null), "")
})
