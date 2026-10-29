import { auth0 } from "@/lib/auth0"
import { readViewAsMarker, isViewAsEnabled } from "@/lib/auth/viewAs"
import { getUserClientSlugs, getUserRoles, type UserRole } from "@/lib/rbac"
import { publishedWebSearchSlugs } from "@/lib/webReport/visibility"
import ClientRoot from "@/components/ClientRoot"
import { isCodexV2Enabled } from "@/lib/codex/flag"
import { readClientFeatureSnapshot, type ClientFeatureSnapshot } from "@/lib/features/server"
import type { ViewAsClientInfo } from "@/contexts/AuthContext"

/**
 * Resolves tenant slugs and effective roles on the server (`auth0.getSession`,
 * which applies an active client view) so the client shell never re-derives
 * them from raw Auth0 profile claims.
 */
export default async function ServerAuthScope({ children }: { children: React.ReactNode }) {
  let clientSlugs: string[] = []
  let serverRoles: UserRole[] | null = null
  let viewAs: ViewAsClientInfo | null = null
  try {
    const session = await auth0.getSession()
    clientSlugs = getUserClientSlugs(session?.user)
    serverRoles = getUserRoles(session?.user)
    const marker = readViewAsMarker(session?.user)
    viewAs = marker ? { slug: marker.slug, clientName: marker.clientName, exp: marker.exp } : null
  } catch {
    clientSlugs = []
    serverRoles = null
    viewAs = null
  }
  // A client's Web & search link shows only once their report is saved and published.
  let webSearchSlugs: string[] = []
  try {
    webSearchSlugs = await publishedWebSearchSlugs(clientSlugs)
  } catch {
    webSearchSlugs = []
  }
  // Feature switches for browser code: one cached read per instance per minute.
  let features: ClientFeatureSnapshot | null = null
  let codexEnabled = false
  try {
    ;[features, codexEnabled] = await Promise.all([readClientFeatureSnapshot(), isCodexV2Enabled()])
  } catch {
    features = null
    codexEnabled = false
  }
  return (
    <ClientRoot
      clientSlugs={clientSlugs}
      webSearchSlugs={webSearchSlugs}
      codexEnabled={codexEnabled}
      serverRoles={serverRoles}
      viewAs={viewAs}
      viewAsEnabled={isViewAsEnabled()}
      features={features}
    >
      {children}
    </ClientRoot>
  )
}
