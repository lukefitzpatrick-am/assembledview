const fs = require("fs")
const s = fs.readFileSync("components/media-containers/RadioContainer.tsx", "utf8")
const lines = s.split(/\n/)
let start = 0
for (let j = 0; j < lines.length; j++) {
  if (
    lines[j].startsWith("// Format Dates") ||
    lines[j].startsWith("const formatDateString") ||
    lines[j].startsWith("interface RadioStation")
  ) {
    start = j
    break
  }
}
const body = lines.slice(start).join("\n")
const syms = [
  "Checkbox",
  "Textarea",
  "FormControl",
  "FormField",
  "FormItem",
  "FormLabel",
  "FormMessage",
  "CardFooter",
  "formatBurstLabel",
  "serializeBurstsJson",
  "Popover",
  "PopoverContent",
  "PopoverTrigger",
  "ChevronDown",
  "formatAUD",
  "parseMoneyInput",
  "CpcFamilyBurstCalculatedField",
  "getCpcFamilyBurstCalculatedColumnLabel",
  "BurstDateRangeColumn",
  "BurstFieldGrid",
  "BurstFieldLabel",
  "BurstLabel",
  "BurstReadonlyMetric",
  "BurstRowActions",
  "BurstRowCard",
  "BurstRowInner",
  "BurstSection",
  "MP_BURST_GRID_7",
  "MP_BURST_INPUT",
  "SingleDatePicker",
  "Combobox",
  "ComboboxModalProvider",
  "Badge",
  "cn",
  "CardContent",
  "CardHeader",
  "CardTitle",
  "Card",
  "Input",
  "Label",
  "Dialog",
  "formatMoney",
  "PlusCircle",
  "ExpertCard",
  "RADIO_EXPERT_CHANNEL_CONFIG",
  "useWatch",
  "Copy",
  "Plus",
  "Trash2",
]
for (const sym of syms) {
  const re = new RegExp("\\b" + sym + "\\b", "g")
  const m = [...body.matchAll(re)]
  console.log(sym + ": " + m.length)
}
console.log("body starts", JSON.stringify(lines[start]))
