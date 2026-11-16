"use client"

/**
 * Project settings: custom fields (B40, plan 4.4 step 2). Create a
 * single-select or multi-select (tags) field, rename it, add, rename,
 * reorder and remove options, pick the done option (single-select, for the
 * progress rule in B42), delete the field, and show or hide its chips on
 * the board's cards (for everyone on the project).
 *
 * The server refuses removing an option a live task uses and deleting a
 * field with values; the dialog shows the server's message.
 */
import { useEffect, useState } from "react"
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import {
  cardFieldKey,
  FIELD_NAME_MAX,
  type CardFieldSetting,
  type CodexCustomField,
  type CustomFieldType,
  type UpdateFieldInput,
} from "@/lib/codex/customFields"

const NONE = "__none__"

export type OptionDraft = { id: string | null; label: string }

/** Move an option up or down (no-op at the ends). */
export function moveOptionDraft(list: readonly OptionDraft[], index: number, direction: -1 | 1): OptionDraft[] {
  const to = index + direction
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return [...list]
  const next = [...list]
  ;[next[index], next[to]] = [next[to], next[index]]
  return next
}

/** One label per line, trimmed, blanks dropped. */
export function optionLabelsFromText(text: string): string[] {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim().replace(/\s+/g, " "))
    .filter(Boolean)
}

function FieldEditor({
  field,
  shown,
  busy,
  onUpdate,
  onDelete,
  onToggleCard,
}: {
  field: CodexCustomField
  shown: boolean
  busy: boolean
  onUpdate: (fieldId: number, patch: UpdateFieldInput) => Promise<boolean>
  onDelete: (fieldId: number) => void
  onToggleCard: (fieldId: number, show: boolean) => void
}) {
  const [name, setName] = useState(field.name)
  const [options, setOptions] = useState<OptionDraft[]>(field.options)
  const [newOption, setNewOption] = useState("")
  const [doneOption, setDoneOption] = useState<string>(field.done_option ?? NONE)

  useEffect(() => {
    setName(field.name)
    setOptions(field.options)
    setDoneOption(field.done_option ?? NONE)
  }, [field])

  const dirty =
    name.trim() !== field.name ||
    JSON.stringify(options) !== JSON.stringify(field.options) ||
    (doneOption === NONE ? null : doneOption) !== field.done_option

  const save = async () => {
    const patch: UpdateFieldInput = {}
    if (name.trim() !== field.name) patch.name = name.trim()
    if (JSON.stringify(options) !== JSON.stringify(field.options)) patch.options = options
    const done = doneOption === NONE ? null : doneOption
    if (done !== field.done_option) patch.done_option = done
    await onUpdate(field.id, patch)
  }

  return (
    <li className="space-y-3 rounded-card border border-border p-3" data-field={field.id}>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={name}
          maxLength={FIELD_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          aria-label={`Name of ${field.name}`}
          className="min-w-[10rem] flex-1"
          disabled={busy}
        />
        <Badge variant="neutral" size="sm">
          {field.field_type === "single_select" ? "Single-select" : "Multi-select"}
        </Badge>
        <label className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Switch checked={shown} onCheckedChange={(on) => onToggleCard(field.id, on)} disabled={busy} aria-label={`Show ${field.name} on cards`} />
          On cards
        </label>
        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Delete ${field.name}`} disabled={busy} onClick={() => onDelete(field.id)}>
          <Trash2 className="h-4 w-4" aria-hidden />
        </Button>
      </div>
      <ul className="space-y-1">
        {options.map((o, i) => (
          <li key={o.id ?? `new-${i}`} className="flex items-center gap-1">
            <Input
              value={o.label}
              onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
              aria-label={`Option ${i + 1} of ${field.name}`}
              className="h-8 flex-1"
              disabled={busy}
            />
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Move option ${o.label} up`} disabled={busy || i === 0} onClick={() => setOptions(moveOptionDraft(options, i, -1))}>
              <ArrowUp className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Move option ${o.label} down`} disabled={busy || i === options.length - 1} onClick={() => setOptions(moveOptionDraft(options, i, 1))}>
              <ArrowDown className="h-3.5 w-3.5" aria-hidden />
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label={`Remove option ${o.label}`} disabled={busy || options.length <= 1} onClick={() => setOptions(options.filter((_, j) => j !== i))}>
              <X className="h-3.5 w-3.5" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && newOption.trim()) {
              e.preventDefault()
              setOptions([...options, { id: null, label: newOption.trim() }])
              setNewOption("")
            }
          }}
          placeholder="Add an option"
          aria-label={`New option for ${field.name}`}
          className="h-8 min-w-[10rem] flex-1"
          disabled={busy}
        />
        {field.field_type === "single_select" ? (
          <Select value={doneOption} onValueChange={setDoneOption} disabled={busy}>
            <SelectTrigger className="h-8 w-44" aria-label={`Done option of ${field.name}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>No done option</SelectItem>
              {options
                .filter((o): o is { id: string; label: string } => o.id != null)
                .map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    Done: {o.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        ) : null}
        <Button type="button" size="sm" onClick={() => void save()} disabled={busy || !dirty || !name.trim()}>
          Save
        </Button>
      </div>
    </li>
  )
}

export type ProjectFieldsEditorProps = {
  fields: CodexCustomField[]
  cardFields: CardFieldSetting[]
  busy?: boolean
  onCreate: (input: { name: string; field_type: CustomFieldType; options: string[] }) => Promise<boolean>
  onUpdate: (fieldId: number, patch: UpdateFieldInput) => Promise<boolean>
  onDelete: (fieldId: number) => void
  onToggleCard: (fieldId: number, show: boolean) => void
  /** B42 (codex_progress_field): the linked progress field; the picker shows only when `onProgressField` is set. */
  progressFieldId?: number | null
  onProgressField?: (fieldId: number | null) => void
}

/** Fields that can be the progress field: single-select with a done option that is still an option. */
export function progressFieldChoices(fields: readonly CodexCustomField[]): CodexCustomField[] {
  return fields.filter((f) => f.field_type === "single_select" && f.done_option != null && f.options.some((o) => o.id === f.done_option))
}

/** Presentational (render-tested): link one single-select field as the project's progress field. */
export function ProgressFieldPicker({
  fields,
  value,
  busy,
  onChange,
}: {
  fields: readonly CodexCustomField[]
  value: number | null
  busy: boolean
  onChange: (fieldId: number | null) => void
}) {
  const choices = progressFieldChoices(fields)
  const linked = fields.find((f) => f.id === value) ?? null
  const inactive = linked != null && !choices.some((f) => f.id === linked.id)
  return (
    <div className="space-y-2 rounded-card border border-border p-3">
      <h3 className="text-sm font-semibold">Progress field</h3>
      <p className="text-xs text-muted-foreground">
        Completing a task sets this field to its done option, and setting the done option completes the task.
      </p>
      <p className="text-xs text-muted-foreground">Linking a field, or changing its done option, also sets it on tasks already done.</p>
      <Select value={value == null ? NONE : String(value)} onValueChange={(v) => onChange(v === NONE ? null : Number(v))} disabled={busy}>
        <SelectTrigger className="w-64" aria-label="Progress field">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No progress field</SelectItem>
          {choices.map((f) => (
            <SelectItem key={f.id} value={String(f.id)}>
              {f.name}
            </SelectItem>
          ))}
          {inactive && linked ? <SelectItem value={String(linked.id)}>{linked.name}</SelectItem> : null}
        </SelectContent>
      </Select>
      {inactive ? <p className="text-xs text-muted-foreground">This field has no done option now, so the rule does nothing until you pick one.</p> : null}
      {choices.length === 0 ? <p className="text-xs text-muted-foreground">Add a single-select field and pick its done option first.</p> : null}
    </div>
  )
}

/** Presentational (render-tested). */
export function ProjectFieldsEditor(props: ProjectFieldsEditorProps) {
  const { fields, cardFields, busy = false } = props
  const [name, setName] = useState("")
  const [type, setType] = useState<CustomFieldType>("single_select")
  const [optionsText, setOptionsText] = useState("")
  const hidden = new Set(cardFields.filter((c) => !c.show).map((c) => c.key))
  const labels = optionLabelsFromText(optionsText)

  const create = async () => {
    if (!name.trim() || labels.length === 0) return
    const ok = await props.onCreate({ name: name.trim(), field_type: type, options: labels })
    if (ok) {
      setName("")
      setOptionsText("")
    }
  }

  return (
    <div className="space-y-4">
      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground">No fields yet. Add Priority, Progress, Stage or Tags to match the Asana project.</p>
      ) : (
        <ul className="space-y-3">
          {fields.map((f) => (
            <FieldEditor
              key={f.id}
              field={f}
              shown={!hidden.has(cardFieldKey(f.id))}
              busy={busy}
              onUpdate={props.onUpdate}
              onDelete={props.onDelete}
              onToggleCard={props.onToggleCard}
            />
          ))}
        </ul>
      )}
      {props.onProgressField ? (
        <ProgressFieldPicker fields={fields} value={props.progressFieldId ?? null} busy={busy} onChange={props.onProgressField} />
      ) : null}
      <div className="space-y-2 rounded-card border border-dashed border-border p-3">
        <h3 className="text-sm font-semibold">Add a field</h3>
        <div className="flex flex-wrap gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Field name" aria-label="New field name" maxLength={FIELD_NAME_MAX} className="min-w-[10rem] flex-1" disabled={busy} />
          <Select value={type} onValueChange={(v) => setType(v === "multi_select" ? "multi_select" : "single_select")} disabled={busy}>
            <SelectTrigger className="w-44" aria-label="New field type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single_select">Single-select</SelectItem>
              <SelectItem value="multi_select">Multi-select (tags)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Label htmlFor="new-field-options" className="text-xs text-muted-foreground">
          Options, one per line
        </Label>
        <Textarea id="new-field-options" value={optionsText} onChange={(e) => setOptionsText(e.target.value)} rows={4} disabled={busy} />
        <Button type="button" size="sm" variant="outline" onClick={() => void create()} disabled={busy || !name.trim() || labels.length === 0}>
          <Plus className="mr-1 h-3.5 w-3.5" aria-hidden />
          {`Add field${labels.length > 0 ? ` with ${labels.length} option${labels.length === 1 ? "" : "s"}` : ""}`}
        </Button>
      </div>
    </div>
  )
}

export function ProjectFieldsDialog({
  open,
  onClose,
  ...editor
}: ProjectFieldsEditorProps & { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Project fields</DialogTitle>
          <DialogDescription>
            Fields show in each task&apos;s detail, as list columns and, when on, as chips on cards. An option a task uses, or a field
            with values, cannot be removed until those values are changed.
          </DialogDescription>
        </DialogHeader>
        <ProjectFieldsEditor {...editor} />
      </DialogContent>
    </Dialog>
  )
}
