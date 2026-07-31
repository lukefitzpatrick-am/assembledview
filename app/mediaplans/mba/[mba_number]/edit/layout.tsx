import { getWriteBackend } from "@/lib/data/backend"
import { WriteBackendProvider } from "@/lib/data/WriteBackendContext"
import { pageMetadata } from "@/lib/nav/routeManifest"

export const metadata = pageMetadata("/mediaplans/mba/[mba_number]/edit")

export default function EditMediaPlanLayout({
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
