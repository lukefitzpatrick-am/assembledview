"use client"

import { useId, useState } from "react"
import type { PlanParseResult } from "@/lib/planParser"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type PlanUploadProps = {
  onParsed: (result: PlanParseResult) => void
  onError?: (message: string) => void
  label?: string
  helperText?: string
  allowMultiple?: boolean
  className?: string
}

export function PlanUpload({
  onParsed,
  onError,
  label = "Import media plan (PDF or CSV)",
  helperText = "Upload media plans or publisher specs. Multiple files are merged into one template.",
  allowMultiple = true,
  className,
}: PlanUploadProps) {
  const inputId = useId()
  const [isUploading, setIsUploading] = useState(false)
  const [lastSummary, setLastSummary] = useState<string | null>(null)

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files
    if (!files || files.length === 0) return

    const formData = new FormData()
    Array.from(files).forEach((file) => formData.append("files", file))

    setIsUploading(true)
    setLastSummary(null)

    try {
      const response = await fetch("/api/processPlan", { method: "POST", body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Failed to process files")

      const summary = `Imported ${data.items?.length || 0} items from ${data.sources?.length || 0} file(s).`
      setLastSummary(summary)
      onParsed(data)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed"
      setLastSummary(message)
      onError?.(message)
    } finally {
      setIsUploading(false)
      event.target.value = ""
    }
  }

  return (
    <Card className={cn("border-slate-200 shadow-sm", className)}>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
        <CardDescription>{helperText}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <Input
          id={inputId}
          type="file"
          accept=".pdf,.csv"
          multiple={allowMultiple}
          disabled={isUploading}
          onChange={handleFileChange}
          className="hidden"
        />
        <div className="flex items-center justify-between">
          <Button
            disabled={isUploading}
            variant="secondary"
            type="button"
            onClick={() => document.getElementById(inputId)?.click()}
          >
            {isUploading ? "Uploading..." : "Select files"}
          </Button>
          {lastSummary && <p className="text-sm text-slate-600">{lastSummary}</p>}
        </div>
      </CardContent>
    </Card>
  )
}


