/**
 * NEXT_PUBLIC_M365_PROVISIONING — default OFF.
 * Only on / 1 / true enables Graph wrappers.
 */
export function isM365ProvisioningEnabled(
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env
): boolean {
  const v = String(env.NEXT_PUBLIC_M365_PROVISIONING ?? "off")
    .trim()
    .toLowerCase()
  return v === "on" || v === "1" || v === "true"
}
