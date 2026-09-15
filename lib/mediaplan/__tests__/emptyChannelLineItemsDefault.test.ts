import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import test from "node:test"

/**
 * Do not import `containerChannelConfig.ts` here — it pulls `lib/api.ts` and
 * requires Xano env. Pin the contract from source.
 *
 * 6 shared-shell channels live in the hook; 14 bespoke containers own their
 * useForm defaultValues. All twenty must start empty so Add creates the first
 * line (ContainerEmptyLinesPlaceholder). Edit hydrate still replaces via
 * useStableHydration — do not change that path.
 */
const LINE_ITEM_DEFAULT_OWNERS = [
  "lib/mediaplan/useMediaChannelContainer.ts",
  "components/media-containers/TelevisionContainer.tsx",
  "components/media-containers/RadioContainer.tsx",
  "components/media-containers/NewspaperContainer.tsx",
  "components/media-containers/MagazinesContainer.tsx",
  "components/media-containers/OOHContainer.tsx",
  "components/media-containers/CinemaContainer.tsx",
  "components/media-containers/DigitalDisplayContainer.tsx",
  "components/media-containers/DigitalAudioContainer.tsx",
  "components/media-containers/DigitalVideoContainer.tsx",
  "components/media-containers/BVODContainer.tsx",
  "components/media-containers/IntegrationContainer.tsx",
  "components/media-containers/SocialMediaContainer.tsx",
  "components/media-containers/InfluencersContainer.tsx",
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
