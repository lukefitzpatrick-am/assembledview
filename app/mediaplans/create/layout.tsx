import { getWriteBackend } from "@/lib/data/backend"
import { WriteBackendProvider } from "@/lib/data/WriteBackendContext"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/mediaplans/create")

export default function CreateMediaPlanLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <WriteBackendProvider writeBackend={getWriteBackend()}>
      {children}
    </WriteBackendProvider>
  )
}
