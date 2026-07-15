"use client"

import { useMemo, useState } from "react"
import {
  Archive,
  ArchiveRestore,
  Download,
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Film,
  LayoutTemplate,
  MoreHorizontal,
  Trash2,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { MockupDialog } from "@/components/creative/mockups/MockupDialog"
import type { CreativeAsset } from "@/lib/creative/types"
import { formatDimensions, formatFileSize } from "@/lib/creative/metadata"
import type { LineItemOption } from "@/lib/creative/lineItemOptions"
import { cn } from "@/lib/utils"

type CreativeAssetTableProps = {
  assets: CreativeAsset[]
  lineItemOptions: LineItemOption[]
  defaultBrandName?: string
  clientName?: string
  campaignName?: string
  mbaNumber?: string
  metaPageId?: string
  allowDelete?: boolean
  allowMockup?: boolean
  onRename: (id: number, assetName: string) => Promise<void>
  onLineItemChange: (
    id: number,
    link: Pick<LineItemOption, "line_item_id" | "source_table"> | null,
  ) => Promise<void>
  onStatusToggle: (id: number, status: CreativeAsset["status"]) => Promise<void>
  onDelete: (id: number) => Promise<void>
}

function assetTypeIcon(mime: string) {
  if (mime.startsWith("image/")) return FileImage
  if (mime.startsWith("video/")) return FileVideo
  if (mime.startsWith("audio/")) return FileAudio
  if (mime === "application/pdf") return FileText
  if (mime.includes("zip")) return Archive
  return Film
}

function formatCreatedAt(createdAt: number): string {
  if (!createdAt) return "—"
  const date = new Date(createdAt)
  if (Number.isNaN(date.getTime())) return "—"
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function InlineAssetName({
  value,
  onSave,
}: {
  value: string
  onSave: (next: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const commit = async () => {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === value) {
      setDraft(value)
      setEditing(false)
      return
    }
    setSaving(true)
    try {
      await onSave(trimmed)
      setEditing(false)
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <Input
        value={draft}
        disabled={saving}
        className="h-8"
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            void commit()
          }
          if (event.key === "Escape") {
            setDraft(value)
            setEditing(false)
          }
        }}
      />
    )
  }

  return (
    <button
      type="button"
      className="interactive-tint max-w-[220px] truncate rounded-input px-1 py-0.5 text-left font-medium"
      onClick={() => {
        setDraft(value)
        setEditing(true)
      }}
    >
      {value}
    </button>
  )
}

export function CreativeAssetTable({
  assets,
  lineItemOptions,
  defaultBrandName = "Brand",
  clientName,
  campaignName,
  mbaNumber,
  metaPageId,
  allowDelete = true,
  allowMockup = true,
  onRename,
  onLineItemChange,
  onStatusToggle,
  onDelete,
}: CreativeAssetTableProps) {
  const [deleteTarget, setDeleteTarget] = useState<CreativeAsset | null>(null)
  const [mockupTarget, setMockupTarget] = useState<CreativeAsset | null>(null)
  const [deleting, setDeleting] = useState(false)

  const socialLineItems = useMemo(
    () => lineItemOptions.filter((option) => option.source_table === "media_plan_social"),
    [lineItemOptions],
  )

  const optionsById = useMemo(() => {
    const map = new Map<string, LineItemOption>()
    for (const option of lineItemOptions) {
      map.set(`${option.source_table}:${option.line_item_id}`, option)
    }
    return map
  }, [lineItemOptions])

  if (assets.length === 0) {
    return (
      <div className="rounded-card border border-border bg-card px-6 py-12 text-center text-sm text-muted-foreground">
        No creative assets match the current filters.
      </div>
    )
  }

  return (
    <>
      <div className="overflow-hidden rounded-card border border-border bg-card shadow-e0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10" />
              <TableHead>Asset name</TableHead>
              <TableHead>Original file</TableHead>
              <TableHead>Size</TableHead>
              <TableHead>Dimensions</TableHead>
              <TableHead>Line item</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Uploaded by</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {assets.map((asset) => {
              const Icon = assetTypeIcon(asset.mime_type)
              const selectValue =
                asset.line_item_id && asset.source_table
                  ? `${asset.source_table}:${asset.line_item_id}`
                  : "none"

              return (
                <TableRow key={asset.id} className="interactive-row">
                  <TableCell>
                    <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                  </TableCell>
                  <TableCell>
                    <InlineAssetName
                      value={asset.asset_name}
                      onSave={(name) => onRename(asset.id, name)}
                    />
                  </TableCell>
                  <TableCell className="max-w-[180px] truncate text-muted-foreground">
                    {asset.original_filename}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap">
                    {formatFileSize(asset.file_size_bytes)}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-muted-foreground">
                    {formatDimensions(asset)}
                  </TableCell>
                  <TableCell className="min-w-[200px]">
                    <Select
                      value={selectValue}
                      onValueChange={(value) => {
                        if (value === "none") {
                          void onLineItemChange(asset.id, null)
                          return
                        }
                        const option = optionsById.get(value)
                        if (!option) return
                        void onLineItemChange(asset.id, {
                          line_item_id: option.line_item_id,
                          source_table: option.source_table,
                        })
                      }}
                    >
                      <SelectTrigger className="h-8">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {lineItemOptions.map((option) => (
                          <SelectItem
                            key={`${option.source_table}:${option.line_item_id}`}
                            value={`${option.source_table}:${option.line_item_id}`}
                          >
                            {option.line_item_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={asset.status === "active" ? "success" : "secondary"}
                      size="sm"
                    >
                      {asset.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="max-w-[160px] truncate text-muted-foreground">
                    {asset.uploaded_by_email || "—"}
                  </TableCell>
                  <TableCell className="num whitespace-nowrap text-muted-foreground">
                    {formatCreatedAt(asset.created_at)}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                          <span className="sr-only">Row actions</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <a href={`/api/creative-assets/${asset.id}/download`}>
                            <Download className="mr-2 h-4 w-4" />
                            Download
                          </a>
                        </DropdownMenuItem>
                        {allowMockup ? (
                          <DropdownMenuItem onClick={() => setMockupTarget(asset)}>
                            <LayoutTemplate className="mr-2 h-4 w-4" />
                            Mockup
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          onClick={() =>
                            void onStatusToggle(
                              asset.id,
                              asset.status === "active" ? "archived" : "active",
                            )
                          }
                        >
                          {asset.status === "active" ? (
                            <>
                              <Archive className="mr-2 h-4 w-4" />
                              Archive
                            </>
                          ) : (
                            <>
                              <ArchiveRestore className="mr-2 h-4 w-4" />
                              Unarchive
                            </>
                          )}
                        </DropdownMenuItem>
                        {allowDelete ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleteTarget(asset)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {allowDelete ? (
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete creative asset?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `“${deleteTarget.asset_name}” will be permanently removed from this campaign and deleted from storage.`
                  : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className={cn("bg-destructive text-destructive-foreground hover:bg-destructive/90")}
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault()
                  if (!deleteTarget) return
                  setDeleting(true)
                  void onDelete(deleteTarget.id)
                    .then(() => setDeleteTarget(null))
                    .finally(() => setDeleting(false))
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {allowMockup ? (
        <MockupDialog
          asset={mockupTarget}
          open={!!mockupTarget}
          onOpenChange={(open) => {
            if (!open) setMockupTarget(null)
          }}
          defaultBrandName={defaultBrandName}
          clientName={clientName ?? defaultBrandName}
          campaignName={campaignName}
          mbaNumber={mbaNumber}
          socialLineItems={socialLineItems}
          metaPageId={metaPageId}
        />
      ) : null}
    </>
  )
}
