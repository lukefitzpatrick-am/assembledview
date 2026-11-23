import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

/**
 * Do not import `containerChannelConfig.ts` here — it pulls `lib/api.ts` and
 * requires Xano env. Pin the contract from source.
 *
 * 19 shared-shell channels live in the hook; 1 bespoke container owns its
 * useForm defaultValues. All twenty must start empty so Add creates the first
 * line (ContainerEmptyLinesPlaceholder). Edit hydrate still replaces via
 * useStableHydration — do not change that path.
 */
const LINE_ITEM_DEFAULT_OWNERS = [
  "lib/mediaplan/useMediaChannelContainer.ts",
  "components/media-containers/ProductionContainer.tsx",
] as const

test("emptyChannelLineItemsDefault is an empty array — Add creates the first line", () => {
  const src = readFileSync(
    join(process.cwd(), "lib/mediaplan/containerChannelConfig.ts"),
    "utf8",
  )
  assert.match(
    src,
    /export function emptyChannelLineItemsDefault[\s\S]{0,400}return \[\]/,
  )
})

test("placeholder copy is the empty-container contract", () => {
  const src = readFileSync(
    join(process.cwd(), "components/media-containers/ContainerEmptyLinesPlaceholder.tsx"),
    "utf8",
  )
  assert.match(src, /Add your first line/)
  assert.match(src, /replaces the auto \$0 starter row/)
})

test("every channel form defaults line items through emptyChannelLineItemsDefault", () => {
  for (const rel of LINE_ITEM_DEFAULT_OWNERS) {
    const src = readFileSync(join(process.cwd(), rel), "utf8")
    assert.ok(
      src.includes("emptyChannelLineItemsDefault"),
      `${rel} must default line items via emptyChannelLineItemsDefault`,
    )
  }
})
