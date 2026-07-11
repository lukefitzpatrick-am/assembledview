import net from "node:net"

/**
 * Reject private / reserved IPv4 and IPv6 addresses (SSRF guard).
 * Covers: 10/8, 172.16/12, 192.168/16, 127/8, 169.254/16, ::1, fc00::/7, and more.
 * Pure helper — no server-only marker so unit tests can import it; only used from mock-page server libs.
 */
export function isPrivateOrReservedIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase()
  if (!trimmed) return true

  // IPv4-mapped IPv6 (:ffff:x.x.x.x)
  const v4Mapped = trimmed.match(/^:ffff:(\d+\.\d+\.\d+\.\d+)$/i)
  if (v4Mapped) return isPrivateOrReservedIp(v4Mapped[1]!)

  if (net.isIPv4(trimmed)) {
    const parts = trimmed.split(".").map((p) => Number(p))
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) {
      return true
    }
    const [a, b] = parts as [number, number, number, number]
    if (a === 10) return true // 10.0.0.0/8
    if (a === 127) return true // 127.0.0.0/8
    if (a === 0) return true // 0.0.0.0/8
    if (a === 169 && b === 254) return true // link-local
    if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
    if (a === 192 && b === 168) return true // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true // CGNAT 100.64/10
    if (a === 192 && b === 0 && parts[2] === 0) return true // 192.0.0.0/24
    if (a === 192 && b === 0 && parts[2] === 2) return true // TEST-NET-1
    if (a === 198 && (b === 18 || b === 19)) return true // benchmarking
    if (a === 198 && b === 51 && parts[2] === 100) return true // TEST-NET-2
    if (a === 203 && b === 0 && parts[2] === 113) return true // TEST-NET-3
    if (a >= 224) return true // multicast / reserved
    return false
  }

  if (net.isIPv6(trimmed)) {
    // Unspecified, loopback
    if (trimmed === "::" || trimmed === "::1") return true
    // Unique local fc00::/7
    if (trimmed.startsWith("fc") || trimmed.startsWith("fd")) return true
    // Link-local fe80::/10
    if (/^fe[89ab]/.test(trimmed)) return true
    // Multicast ff00::/8
    if (trimmed.startsWith("ff")) return true
    // IPv4-compatible / documentation
    if (trimmed.startsWith("2001:db8:")) return true
    return false
  }

  // Unparseable → reject
  return true
}
