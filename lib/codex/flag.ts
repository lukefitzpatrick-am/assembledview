/**
 * Codex v2 (Postgres-native). Off unless explicitly `CODEX_V2=on`.
 * Checked before auth so the module is invisible when disabled.
 */
export function isCodexV2Enabled(): boolean {
  return (process.env.CODEX_V2 ?? "").trim().toLowerCase() === "on"
}
