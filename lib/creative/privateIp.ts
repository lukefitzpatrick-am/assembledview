import net from "node:net"

/**
 * Reject private / reserved IPv4 and IPv6 addresses (SSRF guard).
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase()
  if (!trimmed) return true

  const v4Mapped = trimmed.match(/^:ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (v4Mapped) return isPrivateOrReservedIp(v4Mapped[1]!)

  if (net.isIPv4(trimmed)) {
    const parts = trimmed.split(".").map((p) => Number(p))
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
      return true
    }
    const [a, b] = parts as [number, number, number, number]
    if (a === 10) return true
    if (a === 127) return true
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 100 && b >= 64 && b <= 127) return true
    if (a === 192 && b === 0 && parts[2] === 0) return true
    if (a === 192 && b === 0 && parts[2] === 2) return true
    if (a === 198 && (b === 18 || b === 19)) return true
    if (a === 198 && b === 51 && parts[2] === 100) return true
    if (a === 203 && b === 0 && parts[2] === 113) return true
    if (a >= 224) return true
    return false
  }

  if (net.isIPv6(trimmed)) {
    if (trimmed === "::" || trimmed === "::1") return true
    if (trimmed.startsWith("fc") || trimmed.startsWith("fd")) return true
    if (/^fe[89ab]/.test(trimmed)) return true
    if (trimmed.startsWith("ff")) return true
    if (trimmed.startsWith("2001:db8:")) return true
    return false
  }

  return true
}
