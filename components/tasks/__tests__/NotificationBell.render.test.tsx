/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"

const features = vi.hoisted(() => ({ on: { codex_notifications: false, codex_projects: false } as Record<string, boolean> }))
vi.mock("@/lib/features/client", () => ({ clientFeatureOn: (key: string) => features.on[key] === true }))

import { NotificationBell, NotificationBellPanel, bellLabel, type BellItem } from "../NotificationBell"

const ITEMS: BellItem[] = [
  { id: 2, kind: "mentioned", task_id: 7, task_title: "Book OOH", actor_name: "Ellie Ward", text: 'Ellie Ward mentioned you on "Book OOH"', created_at: new Date().toISOString(), read_at: null },
  { id: 1, kind: "due_changed", task_id: 8, task_title: "Search copy", actor_name: "Mia Tran", text: 'Mia Tran changed the due date of "Search copy"', created_at: "2026-11-12 01:00:00+00", read_at: "2026-11-12 02:00:00+00" },
]

const noop = () => undefined

function panel(overrides: Partial<Parameters<typeof NotificationBellPanel>[0]> = {}) {
  return renderToStaticMarkup(
    <NotificationBellPanel
      state="ready"
      items={ITEMS}
      unread={1}
      emailDigest
      onOpenItem={noop}
      onMarkAll={noop}
      onEmailDigestChange={noop}
      {...overrides}
    />
  )
}

afterEach(() => {
  features.on = { codex_notifications: false, codex_projects: false }
})

describe("NotificationBellPanel", () => {
  it("lists notifications newest first, each linking to its task, unread marked", () => {
    const html = panel()
    expect(html.indexOf("Ellie Ward mentioned you")).toBeLessThan(html.indexOf("Mia Tran changed the due date"))
    expect(html).toContain('href="/tasks/7"')
    expect(html).toContain('href="/tasks/8"')
    expect(html.match(/data-unread="true"/g)?.length).toBe(1)
    expect(html).toContain("&quot;Book OOH&quot;")
    expect(html).toContain("Mark all read")
    expect(html).not.toMatch(/disabled=""[^>]*>Mark all read/)
  })

  it("mark all is disabled with nothing unread; the digest switch shows its state", () => {
    const html = panel({ unread: 0, emailDigest: false })
    expect(html).toMatch(/disabled=""[^>]*>Mark all read/)
    expect(html).toContain('aria-label="Daily email digest"')
    expect(html).toContain('aria-checked="false"')
    expect(panel()).toContain('aria-checked="true"')
  })

  it("says why when there is nothing to show", () => {
    expect(panel({ items: [] })).toContain("Nothing yet.")
    expect(panel({ state: "unavailable", items: [] })).toContain("database update")
    expect(panel({ state: "error", items: [] })).toContain("could not load")
    expect(panel({ state: "loading", items: [] })).toContain("Loading")
  })

  it("labels the bell with the unread count", () => {
    expect(bellLabel(0)).toBe("Notifications")
    expect(bellLabel(4)).toBe("Notifications, 4 unread")
  })
})

describe("NotificationBell", () => {
  it("renders nothing unless codex_notifications is on (its snapshot value already counts codex_projects, B48)", () => {
    expect(renderToStaticMarkup(<NotificationBell />)).toBe("")
    features.on = { codex_notifications: true }
    expect(renderToStaticMarkup(<NotificationBell />)).toContain('aria-label="Notifications"')
  })
})
