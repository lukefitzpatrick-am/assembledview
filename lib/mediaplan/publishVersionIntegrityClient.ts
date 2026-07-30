/**
 * Client-safe publish-integrity helpers (no Xano / postgres imports).
 * The edit page imports from here; server checks live in publishVersionIntegrity.ts.
 */

/** Channel key → version-row mp_* flag (20 channels; mirrors MBA route MEDIA_TYPE_FLAGS). */
export const PUBLISH_INTEGRITY_CHANNEL_FLAGS = {
  television: "mp_television",
  radio: "mp_radio",
  newspaper: "mp_newspaper",
  magazines: "mp_magazines",
  ooh: "mp_ooh",
  cinema: "mp_cinema",
  digitalDisplay: "mp_digidisplay",
  digitalAudio: "mp_digiaudio",
  digitalVideo: "mp_digivideo",
  bvod: "mp_bvod",
  integration: "mp_integration",
  search: "mp_search",
  socialMedia: "mp_socialmedia",
  progDisplay: "mp_progdisplay",
  progVideo: "mp_progvideo",
  progBvod: "mp_progbvod",
  progAudio: "mp_progaudio",
  progOoh: "mp_progooh",
  influencers: "mp_influencers",
  production: "mp_production",
} as const

export type PublishIntegrityChannelKey = keyof typeof PUBLISH_INTEGRITY_CHANNEL_FLAGS

export function isPublishVersionAdvance(
  data: { version_number?: unknown; [key: string]: unknown } | null | undefined,
): boolean {
  return data != null && data.version_number !== undefined
}

export function flagIsEnabledForPublishIntegrity(value: unknown): boolean {
  if (value === undefined || value === null) return false
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase()
    return ["yes", "true", "1", "y", "on"].includes(normalized)
  }
  return false
}

export function enabledPublishIntegrityChannels(
  versionRow: Record<string, unknown>,
): PublishIntegrityChannelKey[] {
  return (Object.keys(PUBLISH_INTEGRITY_CHANNEL_FLAGS) as PublishIntegrityChannelKey[]).filter(
    (key) => flagIsEnabledForPublishIntegrity(versionRow[PUBLISH_INTEGRITY_CHANNEL_FLAGS[key]]),
  )
}

/**
 * Client-side empty-publish guard (Part A). Counts truthy `mp_*` flags on the
 * in-memory form values using the same 20-channel map as the server-side
 * integrity check, so the two checks can never drift apart.
 */
export function countEnabledPublishIntegrityFlags(
  formValues: Record<string, unknown> | null | undefined,
): number {
  if (!formValues) return 0
  return Object.values(PUBLISH_INTEGRITY_CHANNEL_FLAGS).filter((flagKey) =>
    Boolean(formValues[flagKey]),
  ).length
}

/**
 * True when a deferred-publish save must be blocked because channels are
 * enabled but nothing was staged for them. Mirrors the server's 409 guard on
 * the client so the So-Fail path can fire before the publish PATCH is sent.
 */
export function shouldBlockEmptyPublish(args: {
  deferredPublish: boolean
  enabledMediaTypeCount: number
  totalStagedLineItems: number
}): boolean {
  return (
    args.deferredPublish && args.enabledMediaTypeCount > 0 && args.totalStagedLineItems === 0
  )
}
