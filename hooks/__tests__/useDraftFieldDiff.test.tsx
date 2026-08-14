/** @vitest-environment jsdom */
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  DraftDiffProvider,
  useDraftFieldDiff,
  useDraftLineMeta,
} from "@/hooks/useDraftFieldDiff"
import type { PlanDraftStateV1 } from "@/lib/mediaplan/drafts/types"

type FieldDiffResult = {
  changed: boolean
  wasFormatted: string
  isNewLine: boolean
}
type LineMetaResult = { isNew: boolean }

const BASE: PlanDraftStateV1 = {
  v: 1,
  mbaNumber: "glenda006",
  masterId: 1,
  baseVersionId: 4347,
  formValues: {},
  channels: {
    search: [
      {
        line_item_id: "glenda006-se1",
        platform: "Google",
        bursts: [{ budget: "$25,000.00" }],
      },
    ],
  },
  meta: { lineCount: 1, budgetCents: 0 },
}

function FieldProbe(props: {
  lineItemId: string
  fieldPath: string
  value: unknown
  onResult: (r: FieldDiffResult) => void
}) {
  const result = useDraftFieldDiff(props.lineItemId, props.fieldPath, props.value, "money")
  props.onResult(result)
  return (
    <span data-changed={String(result.changed)} data-was={result.wasFormatted} />
  )
}

function LineProbe(props: {
  lineItemId: string
  onResult: (r: LineMetaResult) => void
}) {
  const result = useDraftLineMeta(props.lineItemId)
  props.onResult(result)
  return <span data-new={String(result.isNew)} />
}

describe("useDraftFieldDiff", () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
      true
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
  })

  it("highlights an edited burst budget with the old value, and clears when reverted", () => {
    const latest: { current: FieldDiffResult | null } = { current: null }
    act(() => {
      root.render(
        <DraftDiffProvider base={BASE}>
          <FieldProbe
            lineItemId="glenda006-se1"
            fieldPath="bursts.0.budget"
            value="$20,000.00"
            onResult={(r) => {
              latest.current = r
            }}
          />
        </DraftDiffProvider>
      )
    })
    expect(latest.current?.changed).toBe(true)
    expect(latest.current?.wasFormatted).toBe("$25,000.00")
    expect(container.querySelector("[data-was]")?.getAttribute("data-was")).toBe(
      "$25,000.00",
    )

    act(() => {
      root.render(
        <DraftDiffProvider base={BASE}>
          <FieldProbe
            lineItemId="glenda006-se1"
            fieldPath="bursts.0.budget"
            value="$25,000.00"
            onResult={(r) => {
              latest.current = r
            }}
          />
        </DraftDiffProvider>
      )
    })
    expect(latest.current?.changed).toBe(false)
  })

  it("flags an added line and does not highlight fields on it", () => {
    const field: { current: FieldDiffResult | null } = { current: null }
    const line: { current: LineMetaResult | null } = { current: null }
    act(() => {
      root.render(
        <DraftDiffProvider base={BASE}>
          <LineProbe
            lineItemId="glenda006-se9"
            onResult={(r) => {
              line.current = r
            }}
          />
          <FieldProbe
            lineItemId="glenda006-se9"
            fieldPath="bursts.0.budget"
            value="$1.00"
            onResult={(r) => {
              field.current = r
            }}
          />
        </DraftDiffProvider>
      )
    })
    expect(line.current?.isNew).toBe(true)
    expect(field.current?.changed).toBe(false)
    expect(field.current?.isNewLine).toBe(true)
  })

  it("with no provider there is no highlight overhead", () => {
    const latest: { current: FieldDiffResult | null } = { current: null }
    act(() => {
      root.render(
        <FieldProbe
          lineItemId="glenda006-se1"
          fieldPath="bursts.0.budget"
          value="$20,000.00"
          onResult={(r) => {
            latest.current = r
          }}
        />
      )
    })
    expect(latest.current).toEqual({ changed: false, wasFormatted: "", isNewLine: false })
  })
})
