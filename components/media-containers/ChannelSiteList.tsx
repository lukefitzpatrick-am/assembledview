"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
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
import type { ContainerAdSize, ContainerChannelConfig, ContainerSite, ContainerStation } from "@/lib/mediaplan/containerChannelConfig"
import { useFieldErrors } from "@/hooks/use-field-errors"

type Toast = ReturnType<typeof useToast>["toast"]
type Sites = NonNullable<ContainerChannelConfig["sites"]>

/** "Add a video site", "Add an audio site", "Add a BVOD site": an acronym keeps its case. */
/** "Add a video site for line 2": each card's button names its line (W5e, review F6). */
function addSiteLabel(noun: string, lineNumber: number): string {
  const word = /^[A-Z]+$/.test(noun) ? noun : noun.toLowerCase()
  return `Add ${/^[aeiou]/i.test(word) ? "an" : "a"} ${word} site for line ${lineNumber}`
}

/** What the dialog adds: a site, a station (W5f, Cinema), a title or an ad size (W5i, Newspaper). */
type AddKind = "Site" | "Station" | "Title" | "Ad Size"

/** The dialog's field labels: the line's owner (publisher or network; an ad size has none) and the name. */
const FIELD_LABELS = {
  Site: { platform: "Publisher", name: "Site name" },
  Station: { platform: "Network", name: "Station name" },
  Title: { platform: "Network", name: "Title name" },
  "Ad Size": { platform: "", name: "Ad Size" },
} as const

/** The Add dialogs' rule: a name, and an owner where the kind has one (B58: shown on the fields, not a toast). */
function missingSiteFields(kind: AddKind, name: string, platform: string): { platform?: string; name?: string } {
  const labels = FIELD_LABELS[kind]
  return {
    ...(platform.trim() || !labels.platform ? {} : { platform: `${labels.platform} is required` }),
    ...(name.trim() ? {} : { name: `${labels.name} is required` }),
  }
}

type CardExtras = Partial<{
  dynamicOptionsByKey: Record<string, ComboboxOption[]>
  comboboxPropsByKey: Record<string, Record<string, unknown>>
  fieldAdornments: Record<string, ReactNode>
  stationOptions: ComboboxOption[]
}>

/** One ExpertCard prop set from several catalogues: their per-field maps joined. */
export function mergeCardProps(...parts: CardExtras[]): CardExtras {
  const out: Record<string, unknown> = {}
  for (const part of parts) {
    for (const [key, value] of Object.entries(part)) {
      out[key] = Array.isArray(value) ? value : { ...(out[key] as object), ...value }
    }
  }
  return out
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
    // The dialog shows a missing field on the field before it calls add.
    if (Object.keys(missingSiteFields("Site", name, platform)).length > 0) return
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
      kind: "Site" as AddKind,
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

/** "Add a cinema station for line 2", "Add a TV station for line 2", "Add a newspaper title for line 2": each card's button names its line (W5f, C-341). */
function addStationLabel(noun: string, thing: string, lineNumber: number): string {
  return `Add ${/^[aeiou]/i.test(noun) ? "an" : "a"} ${/^[A-Z]+$/.test(noun) ? noun : noun.toLowerCase()} ${thing} for line ${lineNumber}`
}

/**
 * Add Station for a channel whose config sets `addStation` (W5f, moved from
 * the Cinema container). The button beside the card's Station field needs
 * the line's network; the dialog takes it (the planner can pick another) and
 * a station name.
 * - No `stations` (Cinema, station stub option A): Add writes both to the
 *   line. Nothing is stored or listed.
 * - `stations` (Radio, W5g): the card's Station field lists the catalogue's
 *   stations for the line's network, and Add creates the station, reads the
 *   list again and writes the created network and station to the line.
 *   With `key` "title" (Newspaper, W5i) the same runs on the line's Title.
 * `noun` unset: no list, no card props and no dialog.
 */
export function useChannelStationAdd(
  noun: string | undefined,
  stations: ContainerChannelConfig["stations"],
  form: UseFormReturn,
  fieldKey: string,
  toast: Toast,
) {
  const key = stations?.key ?? "station"
  const kind: AddKind = key === "title" ? "Title" : "Station"
  const thing = kind.toLowerCase()
  const [list, setList] = useState<ContainerStation[]>([])
  const [lineIndex, setLineIndex] = useState<number | null>(null)
  const [network, setNetwork] = useState("")
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    async (errorTitle: string) => {
      if (!stations) return
      try {
        setList(await stations.fetch())
      } catch (error) {
        toast({ title: errorTitle, description: (error as Error).message, variant: "destructive" })
      }
    },
    [stations, toast],
  )

  useEffect(() => {
    if (noun && stations) void load(`Error loading ${noun} ${kind}s`)
  }, [noun, stations, kind, load])

  const openFor = (li: number) => {
    const lineNetwork = form.getValues(`${fieldKey}.${li}.network`)
    if (!lineNetwork) {
      toast({
        title: "Select a Network First",
        description: `Please select a network before adding a ${thing}.`,
        variant: "default",
      })
      return
    }
    setLineIndex(li)
    setName("")
    setNetwork(lineNetwork)
  }

  /** ExpertCard props for line `li`: the Add button, and the catalogue's rows for its network. */
  const cardProps = (li: number): CardExtras => {
    if (!noun) return {}
    const adornment = {
      fieldAdornments: {
        [key]: (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-1"
            aria-label={addStationLabel(noun, thing, li + 1)}
            onClick={() => openFor(li)}
          >
            <PlusCircle className="h-5 w-5 text-primary" aria-hidden />
          </Button>
        ),
      },
    }
    if (!stations) return adornment
    const lineNetwork = form.watch(`${fieldKey}.${li}.network`)
    const options = list
      .filter((s) => !lineNetwork || s.network === lineNetwork)
      .map((s) => ({ value: s[key] || `${key}-${s.id}`, label: s[key] || (key === "title" ? "(Untitled)" : "(Unnamed station)") }))
    return {
      ...adornment,
      ...(key === "station" ? { stationOptions: options } : { dynamicOptionsByKey: { [key]: options } }),
      comboboxPropsByKey: {
        [key]: {
          disabled: !lineNetwork,
          placeholder: lineNetwork ? `Select ${kind}` : "Select Network first",
          searchPlaceholder: `Search ${thing}s...`,
          emptyText: lineNetwork ? `No ${thing}s found for "${lineNetwork}".` : "Select Network first",
          buttonClassName: "h-9 w-full rounded-md",
        },
      },
    }
  }

  const close = () => {
    setLineIndex(null)
    setName("")
    setNetwork("")
  }

  const add = async () => {
    if (Object.keys(missingSiteFields("Station", name, network)).length > 0) return
    if (!stations) {
      // V91 A: the stub stores nothing, so the toast says where the station went.
      if (lineIndex !== null) {
        toast({ title: `Station set on line ${lineIndex + 1}` })
        form.setValue(`${fieldKey}.${lineIndex}.network`, network)
        form.setValue(`${fieldKey}.${lineIndex}.station`, name)
      }
      close()
      return
    }
    try {
      setSaving(true)
      const created = await stations.create({ station: name, network })
      toast({ title: `${kind} Added`, description: `${created[key]} has been successfully added.` })
      await load(`Error refreshing ${noun} ${kind}s`)
      if (lineIndex !== null) {
        form.setValue(`${fieldKey}.${lineIndex}.network`, created.network)
        form.setValue(`${fieldKey}.${lineIndex}.${key}`, created[key])
      }
      close()
    } catch (error) {
      toast({ title: `Error Adding ${kind}`, description: (error as Error).message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return {
    key,
    list,
    cardProps,
    dialog: {
      kind,
      noun,
      pickPublisher: true,
      open: lineIndex !== null,
      platform: network,
      setPlatform: setNetwork,
      name,
      setName,
      saving,
      close,
      add,
    },
  }
}

/**
 * The ad size catalogue for a channel whose config has `adSizes` (W5i, moved
 * from the Newspaper container): the card's Ad Size field lists every ad
 * size, and Add Ad Size beside it creates one, reads the list again and sets
 * it on the line. Unset `adSizes`: no list, no card props and no dialog.
 */
export function useChannelAdSizes(
  adSizes: ContainerChannelConfig["adSizes"],
  noun: string,
  form: UseFormReturn,
  fieldKey: string,
  toast: Toast,
) {
  const [list, setList] = useState<ContainerAdSize[]>([])
  const [lineIndex, setLineIndex] = useState<number | null>(null)
  const [name, setName] = useState("")
  const [saving, setSaving] = useState(false)

  const load = useCallback(
    async (errorTitle: string) => {
      if (!adSizes) return
      try {
        setList(await adSizes.fetch())
      } catch (error) {
        toast({ title: errorTitle, description: (error as Error).message, variant: "destructive" })
      }
    },
    [adSizes, toast],
  )

  useEffect(() => {
    if (adSizes) void load("Error loading Ad Sizes")
  }, [adSizes, load])

  const options = useMemo<ComboboxOption[]>(
    () => list.map((a) => ({ value: a.adsize || `adsize-${a.id}`, label: a.adsize || "(Unnamed ad size)" })),
    [list],
  )

  /** ExpertCard props for line `li`: the Ad Size options and the Add Ad Size button. */
  const cardProps = (li: number): CardExtras => {
    if (!adSizes) return {}
    return {
      dynamicOptionsByKey: { size: options },
      comboboxPropsByKey: {
        size: {
          placeholder: "Select Ad Size",
          searchPlaceholder: "Search ad sizes...",
          emptyText: "No ad sizes found.",
          buttonClassName: "h-9 w-full rounded-md",
        },
      },
      fieldAdornments: {
        size: (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto p-1"
            aria-label={`Add an ad size for line ${li + 1}`}
            onClick={() => {
              setLineIndex(li)
              setName("")
            }}
          >
            <PlusCircle className="h-5 w-5 text-primary" aria-hidden />
          </Button>
        ),
      },
    }
  }

  const close = () => {
    setLineIndex(null)
    setName("")
  }

  const add = async () => {
    // The dialog shows a missing name on the field before it calls add.
    if (!adSizes || !name.trim()) return
    try {
      setSaving(true)
      const created = await adSizes.create({ adsize: name })
      toast({ title: "Ad Size Added", description: `${created.adsize} has been successfully added.` })
      await load("Error refreshing Ad Sizes")
      if (lineIndex !== null) {
        form.setValue(`${fieldKey}.${lineIndex}.size`, created.adsize, { shouldValidate: true, shouldDirty: true })
      }
      close()
    } catch (error) {
      toast({ title: "Error Adding Ad Size", description: (error as Error).message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return {
    options,
    cardProps,
    dialog: {
      kind: "Ad Size" as AddKind,
      noun: adSizes ? noun : undefined,
      pickPublisher: false,
      open: lineIndex !== null,
      platform: "",
      setPlatform: (_platform: string) => {},
      name,
      setName,
      saving,
      close,
      add,
    },
  }
}

/**
 * Add Site (and Add Station, Title and Ad Size), on the shared dialog: focus moves in and is held there, Escape
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
  if (!dialog.noun) return null
  return (
    <Dialog open={dialog.open} onOpenChange={(open) => (open ? undefined : dialog.close())}>
      <DialogContent className="sm:max-w-[425px]">
        {/* Inside the content, so its field errors go when the dialog closes. */}
        <AddSiteForm dialog={dialog} publishers={publishers} />
      </DialogContent>
    </Dialog>
  )
}

function AddSiteForm({
  dialog,
  publishers,
}: {
  dialog: ReturnType<typeof useChannelSiteList>["dialog"]
  publishers: { publisher_name: string }[]
}) {
  const labels = FIELD_LABELS[dialog.kind]
  const errors = useFieldErrors(labels)
  const onSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!errors.check(missingSiteFields(dialog.kind, dialog.name, dialog.platform))) return
    void dialog.add()
  }
  const publisher = errors.control("platform")
  const site = errors.control("name")
  return (
    <form onSubmit={onSubmit}>
      <DialogHeader>
        <DialogTitle>
          Add New {dialog.noun} {dialog.kind}
        </DialogTitle>
        <DialogDescription>
          Enter the details for the new {dialog.noun} {dialog.kind}.
        </DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 py-4">
        {labels.platform ? (
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor={publisher.id} className="text-right">
              {labels.platform}
            </Label>
            {dialog.pickPublisher ? (
              <Combobox
                {...publisher}
                value={dialog.platform}
                onValueChange={(value) => {
                  errors.clear("platform")
                  dialog.setPlatform(value)
                }}
                placeholder={`Select ${labels.platform}`}
                searchPlaceholder={`Search ${labels.platform.toLowerCase()}s...`}
                buttonClassName="col-span-3 h-9"
                className="col-span-3"
                options={publishers.map((p) => ({ value: p.publisher_name, label: p.publisher_name }))}
              />
            ) : (
              <Input {...publisher} value={dialog.platform} readOnly className="col-span-3 bg-muted focus:ring-0" />
            )}
            {errors.message("platform") ? <div className="col-span-3 col-start-2">{errors.message("platform")}</div> : null}
          </div>
        ) : null}
        <div className="grid grid-cols-4 items-center gap-4">
          <Label htmlFor={site.id} className="text-right">
            {labels.name}
          </Label>
          <Input
            {...site}
            value={dialog.name}
            onChange={(e) => {
              errors.clear("name")
              dialog.setName(e.target.value)
            }}
            className="col-span-3"
            autoComplete="off"
          />
          {errors.message("name") ? <div className="col-span-3 col-start-2">{errors.message("name")}</div> : null}
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={dialog.close}>
          Cancel
        </Button>
        <Button type="submit" disabled={dialog.saving} aria-busy={dialog.saving}>
          {dialog.saving ? "Adding..." : `Add ${dialog.kind}`}
        </Button>
      </DialogFooter>
    </form>
  )
}
