import { pageMetadata } from "@/lib/nav/routeManifest"
import { KnowledgeSubnav } from "./KnowledgeSubnav"

export const metadata = pageMetadata("/knowledge")

export default function KnowledgeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <KnowledgeSubnav />
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  )
}
