"use client"

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Download, FileText } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { format } from 'date-fns'

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
}

function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => binary += String.fromCharCode(b))
  return window.btoa(binary)
}

export default function CampaignActions({
  mbaNumber,
  campaign,
  lineItems,
  billingSchedule,
  xanoFileOrigin,
  mediaPlanFileMeta,
  mbaPdfFileMeta,
}: CampaignActionsProps) {
  const [isDownloadingMediaPlan, setIsDownloadingMediaPlan] = useState(false)
  const [isDownloadingMba, setIsDownloadingMba] = useState(false)

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

  const handleDownloadMediaPlan = async () => {
    setIsDownloadingMediaPlan(true)
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
    } catch (error) {
      console.error('Error downloading media plan:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download media plan',
        variant: 'destructive',
      })
    } finally {
      setIsDownloadingMediaPlan(false)
    }
  }

  const handleDownloadMba = async () => {
    setIsDownloadingMba(true)
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
    } catch (error) {
      console.error('Error downloading MBA:', error)
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to download MBA',
        variant: 'destructive',
      })
    } finally {
      setIsDownloadingMba(false)
    }
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 md:left-[240px] bg-background/95 backdrop-blur-sm border-t z-50 shadow-lg">
      <div className="mx-auto flex w-full items-center justify-end gap-4 px-4 py-4 lg:px-6">
        <div className="flex space-x-2">
          <Button
            onClick={handleDownloadMediaPlan}
            disabled={isDownloadingMediaPlan}
            className="bg-[#B5D337] text-white hover:bg-[#B5D337]/90"
          >
            {isDownloadingMediaPlan ? (
              <>
                <Download className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Media Plan
              </>
            )}
          </Button>
          <Button
            onClick={handleDownloadMba}
            disabled={isDownloadingMba}
            className="bg-[#472477] text-white hover:bg-[#472477]/90"
          >
            {isDownloadingMba ? (
              <>
                <FileText className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <FileText className="mr-2 h-4 w-4" />
                Download MBA
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}



































































