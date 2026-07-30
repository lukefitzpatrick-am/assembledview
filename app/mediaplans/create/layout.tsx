import { getWriteBackend } from "@/lib/data/backend"
import { WriteBackendProvider } from "@/lib/data/WriteBackendContext"

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
