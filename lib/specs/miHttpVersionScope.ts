export type MiHttpVersionScopeOk = {
  ok: true
  versionNumber: number | undefined
  mbaWide: boolean
}

export type MiHttpVersionScopeErr = {
  ok: false
  error: "version_required"
  message: string
}

export type MiHttpVersionScope = MiHttpVersionScopeOk | MiHttpVersionScopeErr

const VERSION_REQUIRED_MESSAGE =
  "versionNumber is required. Silent MBA-wide export is refused — pass versionNumber or explicit mbaWide: true."

function positiveVersion(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value
  }
  if (typeof value === "string" && value.trim()) {
    const n = Number(value)
    if (Number.isInteger(n) && n > 0) return n
  }
  return undefined
}

function isExplicitMbaWide(value: unknown): boolean {
  return value === true || value === "true" || value === "1"
}

/**
 * HTTP equivalent of AVA `resolveMiVersionScope`: refuse silent MBA-wide.
 * A positive versionNumber wins over mbaWide.
 */
export function resolveMiHttpVersionScope(input: {
  versionNumber?: unknown
  mbaWide?: unknown
}): MiHttpVersionScope {
  const versionNumber = positiveVersion(input.versionNumber)
  if (versionNumber !== undefined) {
    return { ok: true, versionNumber, mbaWide: false }
  }
  if (isExplicitMbaWide(input.mbaWide)) {
    return { ok: true, versionNumber: undefined, mbaWide: true }
  }
  return {
    ok: false,
    error: "version_required",
    message: VERSION_REQUIRED_MESSAGE,
  }
}
