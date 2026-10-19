"use client"

import { useEffect, useMemo, useRef, useState } from "react"

import { BuilderCanvas } from "@/components/dashboard/web/builder/BuilderCanvas"
import { BuilderTopBar } from "@/components/dashboard/web/builder/BuilderTopBar"
import { ElementLibrary } from "@/components/dashboard/web/builder/ElementLibrary"
import { ElementSettingsPanel } from "@/components/dashboard/web/builder/ElementSettingsPanel"
import { WebReportView } from "@/components/dashboard/web/WebReportView"
import { Skeleton } from "@/components/ui/skeleton"
import {
  addEntry,
  builderRequestBody,
  entriesFromLayout,
  layoutFromEntries,
  moveEntryBy,
  moveEntryTo,
  nextSelection,
  removeEntry,
  setEntryDisplay,
  setEntrySettings,
  setEntryWidth,
  type BuilderEntry,
} from "@/lib/webReport/builder/editor"
import { BUILDER_NEEDS_MIGRATION, WEB_REPORT_VERSION_KEEP, parseBrandTerms } from "@/lib/webReport/builder/layout"
import type { WebElementId, WebReportLayoutItem } from "@/lib/webReport/elements"
import type { ReportPeriod } from "@/lib/webReport/periods"
import type { WebReportData } from "@/lib/webReport/types"

type BuilderVersion = { version: number; savedAt: string | null }

type BuilderResponse = {
  error?: string
  message?: string
  version?: number
  layout?: WebReportLayoutItem[]
  data?: WebReportData
  connected?: boolean
}

export const PREVIEW_DEBOUNCE_MS = 400

export function ReportBuilder({
  slug,
  clientName,
  migrationApplied,
  initialLayout,
  currentVersion,
  versions,
  ga4PropertyRef,
  gscSiteRef,
  brandTerms,
  defaultPeriod,
  keyEventNames,
  kpiRevision = 0,
}: {
  slug: string
  clientName: string
  migrationApplied: boolean
  initialLayout: WebReportLayoutItem[]
  currentVersion: number
  versions: BuilderVersion[]
  ga4PropertyRef: string | null
  gscSiteRef: string | null
  brandTerms: string[]
  defaultPeriod: ReportPeriod
  keyEventNames: string[]
  /** Bumped when saved KPIs change, so the preview reloads them. */
  kpiRevision?: number
}) {
  const [entries, setEntries] = useState<BuilderEntry[]>(() => entriesFromLayout(initialLayout))
  const [selectedKey, setSelectedKey] = useState<string | null>(() => (initialLayout.length > 0 ? "el-0" : null))
  const [terms, setTerms] = useState(brandTerms.join(", "))
  const [period, setPeriod] = useState<ReportPeriod>(defaultPeriod)
  const [version, setVersion] = useState(currentVersion)
  const [history, setHistory] = useState(versions)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<"save" | "restore" | null>(null)
  const [preview, setPreview] = useState<{ data: WebReportData; connected: boolean } | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [clientView, setClientView] = useState(false)
  const keySeq = useRef(0)
  const previewSeq = useRef(0)

  const parsedTerms = useMemo(() => parseBrandTerms(terms), [terms])
  const termsKey = parsedTerms.join("\u0000")

  const selectedIndex = entries.findIndex((entry) => entry.key === selectedKey)
  const selectedEntry = selectedIndex >= 0 ? entries[selectedIndex] : null
  const counts = useMemo(() => {
    const out: Partial<Record<WebElementId, number>> = {}
    for (const entry of entries) out[entry.item.elementId] = (out[entry.item.elementId] ?? 0) + 1
    return out
  }, [entries])

  async function post(body: unknown) {
    const response = await fetch(`/api/dashboard/${slug}/web-builder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const payload = (await response.json().catch(() => null)) as BuilderResponse | null
    return { response, payload }
  }

  useEffect(() => {
    const seq = ++previewSeq.current
    const timer = setTimeout(() => {
      setPreviewError(null)
      void (async () => {
        try {
          const { response, payload } = await post(
            builderRequestBody({
              action: "preview",
              entries: entries.length > 0 ? entries : entriesFromLayout([{ elementId: "notes", settings: { text: "" } }]),
              brandTerms: parsedTerms,
              period,
            }),
          )
          if (seq !== previewSeq.current) return
          if (!response.ok || !payload?.data) {
            setPreviewError(payload?.error ?? "The report data could not be loaded")
            return
          }
          setPreview({ data: payload.data, connected: Boolean(payload.connected) })
        } catch {
          if (seq === previewSeq.current) setPreviewError("The report data could not be loaded")
        }
      })()
    }, PREVIEW_DEBOUNCE_MS)
    return () => clearTimeout(timer)
    // Data depends on the period, brand terms and saved KPIs only. Layout edits re-render from the loaded data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, termsKey, slug, kpiRevision])

  const savedKpis = useMemo(
    () => (preview?.data.kpis?.items ?? []).map((item) => ({ id: item.id, label: item.label })),
    [preview],
  )

  function change(next: (current: BuilderEntry[]) => BuilderEntry[]) {
    const after = next(entries)
    setEntries(after)
    setSelectedKey(nextSelection(entries, after, selectedKey))
  }

  function onAdd(id: WebElementId) {
    keySeq.current += 1
    const key = `new-${keySeq.current}`
    setEntries((current) => addEntry(current, id, key))
    setSelectedKey(key)
  }

  async function onSave() {
    setBusy("save")
    setError(null)
    try {
      const { response, payload } = await post(
        builderRequestBody({ action: "save", entries, brandTerms: parsedTerms, period }),
      )
      if (!response.ok || payload?.version == null) {
        setError(payload?.error ?? "The report could not be saved")
        return
      }
      const saved = payload.version
      setVersion(saved)
      setMessage(payload.message ?? null)
      setHistory((current) =>
        [{ version: saved, savedAt: new Date().toISOString() }, ...current.filter((row) => row.version !== saved)].slice(
          0,
          WEB_REPORT_VERSION_KEEP,
        ),
      )
    } catch {
      setError("The report could not be saved")
    } finally {
      setBusy(null)
    }
  }

  async function onRestore(target: number) {
    setBusy("restore")
    setError(null)
    try {
      const { response, payload } = await post({ action: "restore", version: target })
      if (!response.ok || payload?.version == null) {
        setError(payload?.error ?? "That version could not be restored")
        return
      }
      if (Array.isArray(payload.layout)) {
        keySeq.current += 1
        const restored = entriesFromLayout(payload.layout, `v${payload.version}-${keySeq.current}`)
        setEntries(restored)
        setSelectedKey(restored[0]?.key ?? null)
      }
      setVersion(payload.version)
      setMessage(payload.message ?? null)
    } catch {
      setError("That version could not be restored")
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 sm:px-6">
      <BuilderTopBar
        slug={slug}
        clientName={clientName}
        period={period}
        onPeriod={setPeriod}
        terms={terms}
        onTerms={setTerms}
        ga4PropertyRef={ga4PropertyRef}
        gscSiteRef={gscSiteRef}
        clientView={clientView}
        onClientView={setClientView}
        canSave={migrationApplied && busy == null && entries.length > 0}
        saving={busy === "save"}
        onSave={() => void onSave()}
        version={version}
        history={migrationApplied ? history : []}
        restoring={busy != null}
        onRestore={(target) => void onRestore(target)}
        message={message}
      />

      {migrationApplied ? null : (
        <p className="rounded-card border border-border bg-card px-4 py-3 text-sm text-muted-foreground">{BUILDER_NEEDS_MIGRATION}</p>
      )}
      {error || previewError ? (
        <p role="alert" className="rounded-card border border-border bg-pacing-critical-bg px-4 py-3 text-sm text-status-critical-fg">
          {error ?? previewError}
        </p>
      ) : null}

      {clientView ? (
        preview ? (
          <div className="rounded-frame border border-border bg-background">
            <WebReportView
              slug={slug}
              clientName={clientName}
              period={period}
              layout={layoutFromEntries(entries)}
              data={preview.data}
              connected={preview.connected}
              interactivePeriod={false}
            />
          </div>
        ) : (
          <Skeleton className="h-96 w-full rounded-card" />
        )
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)_300px]">
          <ElementLibrary counts={counts} onAdd={onAdd} />
          <BuilderCanvas
            entries={entries}
            selectedKey={selectedKey}
            data={preview?.data ?? null}
            onSelect={setSelectedKey}
            onMove={(key, delta) => setEntries((current) => moveEntryBy(current, key, delta))}
            onReorder={(from, to) => setEntries((current) => moveEntryTo(current, from, to))}
          />
          <div className="lg:sticky lg:top-4">
            <ElementSettingsPanel
              entry={selectedEntry}
              index={selectedIndex}
              total={entries.length}
              keyEventNames={keyEventNames}
              savedKpis={savedKpis}
              onDisplay={(display) => selectedKey && setEntries((current) => setEntryDisplay(current, selectedKey, display))}
              onWidth={(width) => selectedKey && setEntries((current) => setEntryWidth(current, selectedKey, width))}
              onSettings={(settings) => selectedKey && setEntries((current) => setEntrySettings(current, selectedKey, settings))}
              onMove={(delta) => selectedKey && setEntries((current) => moveEntryBy(current, selectedKey, delta))}
              onRemove={() => selectedKey && change((current) => removeEntry(current, selectedKey))}
            />
          </div>
        </div>
      )}
    </div>
  )
}
