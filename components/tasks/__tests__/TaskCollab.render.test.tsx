/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

import type { TaskAttachment } from "@/lib/codex/attachments"
import type { TeamMember } from "@/lib/codex/types"

import { CommentBody } from "../CommentBody"
import { TaskCollabPanelView, type TaskCollabData } from "../TaskCollabPanel"

const member = (id: number, email: string, name: string, active = true): TeamMember => ({
  id, email, name, role_title: null, active, capacity_notes: null, working_style: null, default_client_ids: [], created_at: "", updated_at: "",
})
const MEMBERS = [member(1, "mia@x.au", "Mia Tran"), member(2, "luke@x.au", "Luke"), member(3, "gone@x.au", "Gone", false)]

const FILE: TaskAttachment = {
  id: 4, task_id: 7, kind: "blob", name: "proofs.pdf", url: null, host: null, size_bytes: 1536, content_type: "application/pdf",
  uploaded_by_email: "luke@x.au", created_at: "", can_delete: true,
}
const LINK: TaskAttachment = {
  id: 5, task_id: 7, kind: "link", name: "Brief", url: "https://assembled.sharepoint.com/brief", host: "assembled.sharepoint.com",
  size_bytes: null, content_type: null, uploaded_by_email: "mia@x.au", created_at: "", can_delete: false,
}

const noop = () => undefined
function view(data: Partial<TaskCollabData> = {}) {
  return renderToStaticMarkup(
    <TaskCollabPanelView
      taskId={7}
      data={{ followers: [{ email: "luke@x.au", name: "Luke", reason: "creator" }], following: true, attachments: [FILE, LINK], ...data }}
      members={MEMBERS}
      onFollow={noop}
      onUnfollow={noop}
      onAddFollower={noop}
      onUploadFile={noop}
      onAddLink={noop}
      onDeleteAttachment={noop}
    />
  )
}

describe("TaskCollabPanelView", () => {
  it("followers with Unfollow when you follow, Follow when you do not", () => {
    expect(view()).toContain(">Unfollow<")
    expect(view({ following: false })).toContain(">Follow<")
    expect(view()).toContain(">Luke<")
  })

  it("files open through the gated route, never a blob URL; links show their host", () => {
    const html = view()
    expect(html).toContain('href="/api/codex/tasks/7/attachments/4"')
    expect(html).not.toContain("blob.vercel-storage")
    expect(html).toContain('href="https://assembled.sharepoint.com/brief"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain("assembled.sharepoint.com")
    expect(html).toContain("2 KB")
    expect(html).toContain("(2)")
  })

  it("delete only where allowed", () => {
    const html = view()
    expect(html).toContain('aria-label="Delete proofs.pdf"')
    expect(html).not.toContain('aria-label="Delete Brief"')
  })

  it("the file picker takes only the allowed types; no attachments says so", () => {
    expect(view()).toContain('accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip"')
    expect(view({ attachments: [] })).toContain("No attachments.")
  })

  it("offers only active people who do not follow yet", () => {
    const html = view()
    expect(html).toContain("Add a follower")
    const none = renderToStaticMarkup(
      <TaskCollabPanelView
        taskId={7}
        data={{ followers: [{ email: "mia@x.au", name: "Mia", reason: "manual" }, { email: "luke@x.au", name: "Luke", reason: "creator" }], following: true, attachments: [] }}
        members={MEMBERS}
        onFollow={noop}
        onUnfollow={noop}
        onAddFollower={noop}
        onUploadFile={noop}
        onAddLink={noop}
        onDeleteAttachment={noop}
      />
    )
    expect(none).not.toContain("Add a follower")
  })
})

describe("CommentBody", () => {
  it("draws stored mentions as chips and leaves other @words as text", () => {
    const html = renderToStaticMarkup(
      <CommentBody body="Thanks @ellie, ask @nobody" mentions={[{ email: "ellie.ward@x.au", name: "Ellie Ward", token: "@ellie" }]} />
    )
    expect(html).toContain('data-mention="ellie.ward@x.au"')
    expect(html).toContain("@Ellie Ward")
    expect(html).toContain("ask @nobody")
    expect(html.match(/data-mention=/g)?.length).toBe(1)
  })

  it("a comment without mentions is plain text", () => {
    const html = renderToStaticMarkup(<CommentBody body="<b>hi</b> @x" />)
    expect(html).toContain("&lt;b&gt;hi&lt;/b&gt; @x")
    expect(html).not.toContain("data-mention")
  })
})
