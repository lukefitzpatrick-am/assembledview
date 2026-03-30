"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Check, Download, FileText, Loader2, MoreHorizontal } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CampaignExportsSection } from '@/components/dashboard/CampaignExportsSection'

type XanoPublicFile = {
  access?: string
  path?: string
  name?: string
  type?: string
  size?: number
  mime?: string
  meta?: Record<string, any>
  url?: string
}

interface CampaignActionsProps {
  mbaNumber: string
  campaign: any
  lineItems: Record<string, any[]>
  billingSchedule: any
  xanoFileOrigin: string
  mediaPlanFileMeta: XanoPublicFile | null
  mbaPdfFileMeta: XanoPublicFile | null
  variant?: 'floating' | 'inline' | 'minimal'
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => binary += String.fromCharCode(b))
  return window.btoa(binary)
}

export default function CampaignActions({
  mbaNumber,
  campaign: _campaign,
  lineItems,
  billingSchedule,
  xanoFileOrigin,
  mediaPlanFileMeta,
  mbaPdfFileMeta,
  variant = 'floating',
}: CampaignActionsProps) {
  const [isDownloadingMediaPlan, setIsDownloadingMediaPlan] = useState(false)
  const [isDownloadingMba, setIsDownloadingMba] = useState(false)
  const [isDownloadingBilling, setIsDownloadingBilling] = useState(false)
  const [completedAction, setCompletedAction] = useState<"mediaPlan" | "mba" | "billing" | null>(null)
  const [ariaStatus, setAriaStatus] = useState("")
  const lineItemCount = Object.values(lineItems || {}).reduce(
    (sum, items) => sum + (Array.isArray(items) ? items.length : 0),
    0
  )
  const isBusy = isDownloadingMediaPlan || isDownloadingMba || isDownloadingBilling

  const markSuccess = (action: "mediaPlan" | "mba" | "billing") => {
    setCompletedAction(action)
    setTimeout(() => setCompletedAction((current) => (current === action ? null : current)), 1200)
  }

  const downloadFromXano = async (opts: {
    label: string
    meta: XanoPublicFile | null
    fallbackFileName: string
  }) => {
    const { label, meta, fallbackFileName } = opts
    if (!meta) {
      throw new Error(`${label} file not found for this version yet.`)
    }

    const directUrl = typeof meta.url === "string" && meta.url.trim() ? meta.url.trim() : null
    const path = typeof meta.path === "string" && meta.path.trim() ? meta.path.trim() : null
    const fileName = (typeof meta.name === "string" && meta.name.trim()) ? meta.name.trim() : fallbackFileName

    const url =
      directUrl ||
      (path && xanoFileOrigin ? `${xanoFileOrigin}${path.startsWith("/") ? "" : "/"}${path}` : null)

    if (!url) {
      throw new Error(`${label} file metadata is missing a download URL/path.`)
    }

    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download ${label} (${response.status})`)
    }

    const blob = await response.blob()
    const objectUrl = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(objectUrl)
    document.body.removeChild(a)
  }

  const downloadBillingAsJson = async () => {
    if (!billingSchedule) {
      throw new Error("Billing schedule not found for this campaign.")
    }
    const payload =
      typeof billingSchedule === "string"
        ? billingSchedule
        : JSON.stringify(billingSchedule, null, 2)
    const blob = new Blob([payload], { type: "application/json;charset=utf-8" })
    const objectUrl = window.URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = objectUrl
    a.download = `billing-schedule-${mbaNumber}.json`
    document.body.appendChild(a)
    a.click()
    window.URL.revokeObjectURL(objectUrl)
    document.body.removeChild(a)
  }

  const handleDownloadMediaPlan = async () => {
    setIsDownloadingMediaPlan(true)
    setAriaStatus("Downloading media plan")
    try {
      await downloadFromXano({
        label: "Media plan",
        meta: mediaPlanFileMeta,
        fallbackFileName: `media-plan-${mbaNumber}.xlsx`,
      })

      toast({
        title: 'Success',
        description: 'Media plan downloaded successfully',
      })
      setAriaStatus("Media plan downloaded successfully")
      markSuccess("mediaPlan")
    } catch (error) {
      console.error('Error downloading media plan:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download media plan',
        variant: 'destructive',
      })
      setAriaStatus("Media plan download failed")
    } finally {
      setIsDownloadingMediaPlan(false)
    }
  }

  const handleDownloadMba = async () => {
    setIsDownloadingMba(true)
    setAriaStatus("Downloading MBA")
    try {
      await downloadFromXano({
        label: "MBA",
        meta: mbaPdfFileMeta,
        fallbackFileName: `mba-${mbaNumber}.pdf`,
      })

      toast({
        title: 'Success',
        description: 'MBA downloaded successfully',
      })
      setAriaStatus("MBA downloaded successfully")
      markSuccess("mba")
    } catch (error) {
      console.error('Error downloading MBA:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download MBA',
        variant: 'destructive',
      })
      setAriaStatus("MBA download failed")
    } finally {
      setIsDownloadingMba(false)
    }
  }

  const handleDownloadBilling = async () => {
    setIsDownloadingBilling(true)
    setAriaStatus("Downloading billing schedule")
    try {
      await downloadBillingAsJson()
      toast({
        title: "Success",
        description: "Billing schedule downloaded successfully",
      })
      setAriaStatus("Billing schedule downloaded successfully")
      markSuccess("billing")
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to download billing schedule",
        variant: "destructive",
      })
      setAriaStatus("Billing schedule download failed")
    } finally {
      setIsDownloadingBilling(false)
    }
  }

  const showFloating = variant === "floating"
  const showInline = variant === "inline"
  const showMinimal = variant === "minimal"

  const ActionIcon = ({
    action,
    loading,
    icon,
  }: {
    action: "mediaPlan" | "mba" | "billing"
    loading: boolean
    icon: React.ReactNode
  }) => {
    if (loading) return <Loader2 className="h-4 w-4 animate-spin" />
    if (completedAction === action) return <Check className="h-4 w-4 animate-in zoom-in-75 duration-200" />
    return <>{icon}</>
  }

  const exportsVariant = showFloating ? "floating" : showInline ? "inline" : "minimal"

  return (
    <CampaignExportsSection
      variant={exportsVariant}
      mbaNumber={mbaNumber}
      lineItemCount={lineItemCount}
      isBusy={isBusy}
      ariaStatus={ariaStatus}
    >
      {showFloating ? (
        <div className="md:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-full px-4 focus-visible:ring-2 focus-visible:ring-ring"
                disabled={isBusy}
              >
                <MoreHorizontal className="mr-1.5 h-4 w-4" />
                Downloads
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleDownloadMediaPlan} disabled={isBusy}>
                Download Media Plan
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadMba} disabled={isBusy}>
                Download MBA
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleDownloadBilling} disabled={isBusy}>
                Download Billing
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : null}

      <Button
        onClick={handleDownloadMediaPlan}
        disabled={isBusy}
        className={cn(
          "h-9 rounded-full px-4 py-2 text-white",
          showFloating ? "hidden md:inline-flex" : "inline-flex",
          "bg-lime hover:bg-lime/90 focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ActionIcon action="mediaPlan" loading={isDownloadingMediaPlan} icon={<Download className="h-4 w-4" />} />
        <span className="ml-2">Media Plan</span>
      </Button>
      <Button
        onClick={handleDownloadMba}
        disabled={isBusy}
        className={cn(
          "h-9 rounded-full px-4 py-2 text-white",
          showFloating ? "hidden md:inline-flex" : "inline-flex",
          "bg-brand-dark hover:bg-brand-dark/90 focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ActionIcon action="mba" loading={isDownloadingMba} icon={<FileText className="h-4 w-4" />} />
        <span className="ml-2">MBA</span>
      </Button>
      <Button
        onClick={handleDownloadBilling}
        disabled={isBusy}
        className={cn(
          "h-9 rounded-full px-4 py-2",
          showFloating ? "hidden md:inline-flex" : "inline-flex",
          "bg-muted text-foreground hover:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <ActionIcon action="billing" loading={isDownloadingBilling} icon={<Download className="h-4 w-4" />} />
        <span className="ml-2">Billing</span>
      </Button>
    </CampaignExportsSection>
  )
}



































































