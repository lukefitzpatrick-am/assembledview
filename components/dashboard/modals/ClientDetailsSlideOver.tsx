"use client"

import { useState } from "react"
import { AlertCircle, Building2, Save } from "lucide-react"

import { EditClientForm } from "@/components/EditClientForm"
import { SlideOver } from "@/components/ui/SlideOver"

export interface ClientDetailsSlideOverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientRecord: Record<string, unknown> | null
  brandColour?: string
}

export function ClientDetailsSlideOver({
  open,
  onOpenChange,
  clientRecord,
  brandColour,
}: ClientDetailsSlideOverProps) {
  const [refresh, setRefresh] = useState(0)

  const idRaw = clientRecord?.id
  const idNum = typeof idRaw === "number" ? idRaw : Number(idRaw)
  const canEdit = clientRecord != null && Number.isFinite(idNum)

  const formClient = canEdit
    ? { ...clientRecord, id: idNum, keyphone: String(clientRecord.keyphone ?? "") }
    : null

  const handleSuccess = () => {
    setRefresh((n) => n + 1)
  }

  const clientName =
    typeof clientRecord?.client_name === "string"
      ? clientRecord.client_name
      : typeof clientRecord?.name === "string"
        ? clientRecord.name
        : "Client"

  return (
    <SlideOver
      open={open}
      onOpenChange={onOpenChange}
      title="Client details"
      description={`View and manage ${clientName} information`}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <div
          className="h-1 w-full"
          style={{
            background: brandColour
              ? `linear-gradient(to right, ${brandColour}99, ${brandColour}, ${brandColour}99)`
              : undefined,
          }}
        />
        {!brandColour && (
          <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {formClient ? (
            <div className="space-y-6 p-6">
              <div className="flex items-center gap-3 border-b border-border pb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Building2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Account Information</h3>
                  <p className="text-sm text-muted-foreground">Core client details and contact information</p>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-card/50 p-4">
                <EditClientForm
                  key={refresh}
                  layout="panel"
                  client={formClient as never}
                  onSuccess={handleSuccess}
                />
              </div>

              <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                <Save className="h-4 w-4 shrink-0" />
                <span>Changes are saved when you click the save button above.</span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
                <AlertCircle className="h-8 w-8 text-amber-500" />
              </div>
              <h3 className="mb-2 font-semibold text-foreground">Client Record Not Found</h3>
              <p className="max-w-[280px] text-sm text-muted-foreground">
                No matching client record in Xano for this slug. Check client name and slug configuration.
              </p>
            </div>
          )}
        </div>
      </div>
    </SlideOver>
  )
}
