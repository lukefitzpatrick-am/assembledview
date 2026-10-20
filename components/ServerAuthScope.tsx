import { auth0 } from "@/lib/auth0"
import { getUserClientSlugs } from "@/lib/rbac"
import { publishedWebSearchSlugs } from "@/lib/webReport/visibility"
import ClientRoot from "@/components/ClientRoot"

/**
 * Resolves tenant slugs on the server (`getUserClientSlugs`) so the client
 * shell never re-derives them from raw claims.
 */
export default async function ServerAuthScope({ children }: { children: React.ReactNode }) {
  let clientSlugs: string[] = []
  try {
    const session = await auth0.getSession()
    clientSlugs = getUserClientSlugs(session?.user)
  } catch {
    clientSlugs = []
  }
  // A client's Web & search link shows only once their report is saved and published.
  let webSearchSlugs: string[] = []
  try {
    webSearchSlugs = await publishedWebSearchSlugs(clientSlugs)
  } catch {
    webSearchSlugs = []
  }
  return <ClientRoot clientSlugs={clientSlugs} webSearchSlugs={webSearchSlugs}>{children}</ClientRoot>
}
