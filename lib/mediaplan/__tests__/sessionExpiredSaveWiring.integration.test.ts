/**
 * ON-3 / SE-1 — create + edit must surface 401s. Does not change save writers.
 */
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"

const CREATE_PAGE = join(process.cwd(), "app/mediaplans/create/page.tsx")
const EDIT_PAGE = join(
  process.cwd(),
  "app/mediaplans/mba/[mba_number]/edit/page.tsx"
)
const DRAFT_HOOK = join(process.cwd(), "hooks/usePlanDraftSession.ts")
const SAVING_MODAL = join(process.cwd(), "components/ui/saving-modal.tsx")
const CLIENT_LAYOUT = join(process.cwd(), "components/ClientLayout.tsx")

describe("create + edit 401 save wiring", () => {
  it("both pages import the session-expiry helper and check saveResult.status", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      assert.match(src, /from "@\/lib\/auth\/writeSessionExpiry"/)
      assert.match(src, /isUnauthorizedStatus\s*\(\s*saveResult\.status/)
      assert.match(src, /applySessionExpiredToSaveItems/)
      assert.match(src, /SESSION_EXPIRED_SAVE_MESSAGE/)
      assert.doesNotMatch(
        src,
        /isUnauthorizedStatus\s*\(\s*saveResult\.status[\s\S]{0,400}clearDirtyOnSaveSuccess/
      )
    }
  })

  it("create throws WriteSessionExpiredError on postgres 401 so handleSaveAll does not navigate", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    assert.match(
      createSrc,
      /isUnauthorizedStatus\s*\(\s*saveResult\.status[\s\S]{0,800}throw new WriteSessionExpiredError/
    )
    assert.match(
      createSrc,
      /if \(isWriteSessionExpiredError\(err\)\) \{\s*throw err/
    )
    assert.match(createSrc, /versionResult === 'publish_pending'/)
    assert.match(createSrc, /router\.push\('\/mediaplans'\)/)
  })

  it("edit working-draft save uses the same 401 copy instead of the raw fetch message", () => {
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    assert.match(editSrc, /saveDraftNow\(\)/)
    assert.match(
      editSrc,
      /isWriteSessionExpiredError\(draftErr\)[\s\S]{0,400}SESSION_EXPIRED_SAVE_MESSAGE/
    )
  })

  it("Xano PUT 401 on create and edit uses the session-expired copy", () => {
    const createSrc = readFileSync(CREATE_PAGE, "utf8")
    const editSrc = readFileSync(EDIT_PAGE, "utf8")
    for (const src of [createSrc, editSrc]) {
      assert.match(src, /isUnauthorizedStatus\s*\(\s*versionResponse\.status/)
    }
  })
})

describe("draft write 401 + app banner", () => {
  it("persistServer interprets 401 via the shared helper (does not invent a new store)", () => {
    const hookSrc = readFileSync(DRAFT_HOOK, "utf8")
    assert.match(hookSrc, /throwIfWriteUnauthorized/)
    assert.match(hookSrc, /noteAuthenticatedWriteOk/)
  })

  it("SavingModal and ClientLayout surface the blocking copy / banner", () => {
    const modalSrc = readFileSync(SAVING_MODAL, "utf8")
    const layoutSrc = readFileSync(CLIENT_LAYOUT, "utf8")
    assert.match(modalSrc, /savingModalChromeForItems/)
    assert.match(layoutSrc, /SessionExpiredBanner/)
  })
})
