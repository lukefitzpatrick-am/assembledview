/**
 * Single source of truth for create-form media-type toggles.
 *
 * The create page iterates `CREATE_MEDIA_TYPE_CATALOG` (attaching container
 * components). Planner carry-through keys are derived from the same catalog by
 * excluding non-carry entries — so MP_KEY_ORDER / CREATE_MEDIA_TOGGLE_KEYS
 * cannot drift from the form without changing this file.
 */

/** Ordered catalog the create form renders as media-type toggles. */
export const CREATE_MEDIA_TYPE_CATALOG = [
  { name: "mp_fixedfee", label: "Fixed Fee" },
  { name: "mp_television", label: "Television" },
  { name: "mp_radio", label: "Radio" },
  { name: "mp_newspaper", label: "Newspaper" },
  { name: "mp_magazines", label: "Magazines" },
  { name: "mp_ooh", label: "OOH" },
  { name: "mp_cinema", label: "Cinema" },
  { name: "mp_digidisplay", label: "Digital Display" },
  { name: "mp_digiaudio", label: "Digital Audio" },
  { name: "mp_digivideo", label: "Digital Video" },
  { name: "mp_bvod", label: "BVOD" },
  { name: "mp_integration", label: "Integration" },
  { name: "mp_search", label: "Search" },
  { name: "mp_socialmedia", label: "Social Media" },
  { name: "mp_progdisplay", label: "Prog Display" },
  { name: "mp_progvideo", label: "Prog Video" },
  { name: "mp_progbvod", label: "Prog BVOD" },
  { name: "mp_progaudio", label: "Prog Audio" },
  { name: "mp_progooh", label: "Prog OOH" },
  { name: "mp_influencers", label: "Influencers" },
  { name: "mp_production", label: "Production" },
] as const

type CreateMediaTypeCatalogEntry =
  (typeof CREATE_MEDIA_TYPE_CATALOG)[number]

export type CreateMediaTypeCatalogName = CreateMediaTypeCatalogEntry["name"]

/** Not planner carry-through containers (still shown as create toggles). */
type CreateNonCarryKey = "mp_fixedfee" | "mp_production"

export type CreateMediaToggleKey = Exclude<
  CreateMediaTypeCatalogName,
  CreateNonCarryKey
>

function isCarryThroughEntry(
  entry: CreateMediaTypeCatalogEntry
): entry is Extract<CreateMediaTypeCatalogEntry, { name: CreateMediaToggleKey }> {
  return entry.name !== "mp_fixedfee" && entry.name !== "mp_production"
}

/**
 * Carry-through / residual-order keys — derived from CREATE_MEDIA_TYPE_CATALOG
 * (same order, minus fixedfee + production).
 */
export const CREATE_MEDIA_TOGGLE_KEYS: readonly CreateMediaToggleKey[] =
  CREATE_MEDIA_TYPE_CATALOG.filter(isCarryThroughEntry).map((e) => e.name)
