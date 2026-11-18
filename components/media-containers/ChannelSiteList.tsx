"use client"

import { useCallback, useEffect, useId, useState, type FormEvent } from "react"
import type { UseFormReturn } from "react-hook-form"
import { PlusCircle } from "lucide-react"

import { normalizeKey } from "@/components/media-containers/ExpertGrid"
import { Button } from "@/components/ui/button"
import { Combobox, type ComboboxOption } from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { useToast } from "@/components/ui/use-toast"
import type { ContainerChannelConfig, ContainerSite } from "@/lib/mediaplan/containerChannelConfig"

type Toast = ReturnType<typeof useToast>["toast"]
type Sites = NonNullable<ContainerChannelConfig["sites"]>

/** "Add a video site", "Add an audio site", "Add a BVOD site": an acronym keeps its case. */
/** "Add a video site for line 2": each card's button names its line (W5e, review F6). */
function addSiteLabel(noun: string, lineNumber: number): string {
  const word = /^[A-Z]+$/.test(noun) ? noun : noun.toLowerCase()
  return `Add ${/^[aeiou]/i.test(word) ? "an" : "a"} ${word} site for line ${lineNumber}`
}

/**
 * The site catalogue for a channel whose config has `sites` (W5c, moved from
 * the Digital Video container). Unset `sites`: an empty list, no card props,
 * and no dialog.
 */
export function useChannelSiteList(
  sites: Sites | undefined,
  form: UseFormReturn,
  fieldKey: string,
  toast: Toast,
) {
  const [list, setList] = useState<ContainerSite[]>([])
  const [lineIndex, setLineIndex] = useState<number | null>(null)
  const [platform, setPlatform] = useState("")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    async (errorTitle: string) => {
      if (!sites) return
      try {
        setList(await sites.fetch())
      } catch (error) {
        toast({ title: errorTitle, description: (error as Error).message, variant: "destructive" })
      }
    },
    [sites, toast],
  )

  useEffect(() => {
    if (sites) void load(`Error loading ${sites.noun.toLowerCase()} sites`)
  }, [sites, load])

  /** The line's publisher; a line saved with only a platform falls back to it. */
  const publisherOf = (li: number): string =>
    form.watch(`${fieldKey}.${li}.publisher`) || form.watch(`${fieldKey}.${li}.platform`) || ""

  const openFor = (li: number, publisher: string) => {
    if (!publisher) {
      toast({
        title: "Select a Publisher First",
        description: "Please select a Publisher before adding a site.",
        variant: "default",
      })
      return
    }
    setLineIndex(li)
    setName("")
    setPlatform(publisher)
  }

  /** ExpertCard props for line `li`: the Site options, its combobox text and the Add Site button. */
  const cardProps = (li: number) => {
    if (!sites) return {}
    const publisher = publisherOf(li)
    const key = normalizeKey(publisher)
    const options: ComboboxOption[] = list
      .filter((s) => !publisher || normalizeKey(s.platform) === key)
      .map((s) => ({ value: s.site || `site-${s.id}`, label: s.site || "(Unnamed site)" }))
    return {
      dynamicOptionsByKey: { site: options },
      comboboxPropsByKey: {
        site: {
          disabled: !publisher,
          placeholder: publisher ? "Select Site" : "Select Publisher first",
          searchPlaceholder: "Search sites...",
          emptyText: publisher ? `No sites found for "${publisher}".` : "Select Publisher first",
          buttonClassName: "h-9 w-full rounded-md",
        },
      },
      fieldAdornments: {
        site: (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-1"
            aria-label={addSiteLabel(sites.noun, li + 1)}
            onClick={() => openFor(li, publisher)}
          >
            <PlusCircle className="h-5 w-5 text-primary" aria-hidden />
          </Button>
        ),
      },
    }
  }

  /** A publisher pick sets the line's platform and clears its site. */
  const onComboboxValueChange = (key: string, li: number, value: string) => {
    if (!sites || key !== "publisher") return
    form.setValue(`${fieldKey}.${li}.platform`, value, { shouldDirty: true })
    form.setValue(`${fieldKey}.${li}.site`, "", { shouldDirty: true })
  }

  const close = () => {
    setLineIndex(null)
    setName("")
    setPlatform("")
  }

  const add = async () => {
    if (!sites) return
    if (!name.trim() || !platform.trim()) {
      toast({
        title: "Missing Information",
        description: "Please provide both site name and platform.",
        variant: "destructive",
      })
      return
    }
    try {
      setSaving(true)
      const created = await sites.create({ site: name, platform })
      toast({ title: "Site Added", description: `${created.site} has been successfully added.` })
      await load(`Error refreshing ${sites.noun} Sites`)
      if (lineIndex !== null) {
        form.setValue(`${fieldKey}.${lineIndex}.publisher`, platform, { shouldDirty: true })
        form.setValue(`${fieldKey}.${lineIndex}.platform`, platform, { shouldDirty: true })
        form.setValue(`${fieldKey}.${lineIndex}.site`, created.site, { shouldDirty: true })
      }
      close()
    } catch (error) {
      toast({ title: "Error Adding Site", description: (error as Error).message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return {
    list,
    publisherOf,
    cardProps,
    onComboboxValueChange,
    dialog: {
      noun: sites?.noun,
      pickPublisher: sites?.pickPublisher === true,
      open: lineIndex !== null,
      platform,
      setPlatform,
      name,
      setName,
      saving,
      close,
      add,
    },
  }
}

/**
 * Add Site, on the shared dialog: focus moves in and is held there, Escape
 * and Cancel close it, focus goes back to the Add Site button on close, Enter in the name field adds the site, and both
 * fields have labels. The publisher is the line's: read-only, or a publisher
 * pick when the config sets `pickPublisher`.
 */
export function AddSiteDialog({
  dialog,
  publishers,
}: {
  dialog: ReturnType<typeof useChannelSiteList>["dialog"]
  publishers: { publisher_name: string }[]
}) {
  const id = useId()
  if (!dialog.noun) return null
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    void dialog.add()
  }
  return (
    <Dialog open={dialog.open} onOpenChange={(open) => (open ? undefined : dialog.close())}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={onSubmit}>
          <DialogHeader>
            <DialogTitle>Add New {dialog.noun} Site</DialogTitle>
            <DialogDescription>Enter the details for the new {dialog.noun} Site.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor={`${id}-publisher`} className="text-right">
                Publisher
              </Label>
              {dialog.pickPublisher ? (
                <Combobox
                  id={`${id}-publisher`}
                  value={dialog.platform}
                  onValueChange={dialog.setPlatform}
                  placeholder="Select Publisher"
                  searchPlaceholder="Search publishers..."
                  buttonClassName="col-span-3 h-9"
                  className="col-span-3"
                  options={publishers.map((p) => ({ value: p.publisher_name, label: p.publisher_name }))}
                />
              ) : (
                <Input
                  id={`${id}-publisher`}
                  value={dialog.platform}
                  readOnly
                  className="col-span-3 bg-muted focus:ring-0"
                />
              )}
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor={`${id}-site`} className="text-right">
                Site name
              </Label>
              <Input
                id={`${id}-site`}
                value={dialog.name}
                onChange={(e) => dialog.setName(e.target.value)}
                className="col-span-3"
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={dialog.close}>
              Cancel
            </Button>
            <Button type="submit" disabled={dialog.saving} aria-busy={dialog.saving}>
              {dialog.saving ? "Adding..." : "Add Site"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
