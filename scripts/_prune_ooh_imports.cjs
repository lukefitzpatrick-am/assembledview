const fs = require("fs")
const p = "components/media-containers/OohContainer.tsx"
let s = fs.readFileSync(p, "utf8")

if (!s.includes('from "@/components/media-containers/ExpertCard"')) {
  s = s.replace(
    'import { Badge } from "@/components/ui/badge"\n',
    'import { Badge } from "@/components/ui/badge"\n' +
      'import { ExpertCard } from "@/components/media-containers/ExpertCard"\n' +
      'import { OOH_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"\n'
  )
}

s = s.replace(
  'import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"',
  'import { Form } from "@/components/ui/form"'
)
s = s.replace('import { Input } from "@/components/ui/input"\n', "")
s = s.replace(
  'import { Combobox, ComboboxModalProvider } from "@/components/ui/combobox"',
  'import { ComboboxModalProvider } from "@/components/ui/combobox"'
)
s = s.replace('import { Checkbox } from "@/components/ui/checkbox"\n', "")
s = s.replace('import { Textarea } from "@/components/ui/textarea"\n', "")
s = s.replace(
  'import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"',
  'import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"'
)
s = s.replace('import { formatBurstLabel } from "@/lib/bursts"\n', "")
s = s.replace(
  'import { serializeBurstsJson } from "@/lib/mediaplan/serializeBurstsJson"\n',
  ""
)
s = s.replace(
  'import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"\n',
  ""
)
s = s.replace(
  'import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"',
  'import { Copy, Plus, Trash2 } from "lucide-react"'
)
s = s.replace(
  'import { formatAUD, formatMoney, parseMoneyInput } from "@/lib/format/money"',
  'import { formatMoney } from "@/lib/format/money"'
)
s = s.replace(
  `import {
  CpcFamilyBurstCalculatedField,
} from "@/components/media-containers/burst-calculated-fields"
`,
  ""
)
s = s.replace(
  `import {
  MP_BURST_ACTION_COLUMN,
  MP_BURST_CARD,
  MP_BURST_CARD_CONTENT,
  MP_BURST_GRID_7,
  MP_BURST_HEADER_INNER,
  MP_BURST_HEADER_SHELL,
  MP_BURST_LABEL_COLUMN,
  MP_BURST_SECTION_OUTER,

  MP_BURST_HEADER_ROW,
  MP_BURST_LABEL_HEADING,
  MP_BURST_ROW_SHELL,} from "@/lib/mediaplan/burstSectionLayout"
`,
  ""
)
s = s.replace(
  'import { SingleDatePicker } from "@/components/ui/single-date-picker"\n',
  ""
)

fs.writeFileSync(p, s)
console.log("Ooh imports pruned + ExpertCard wired")
console.log("has ExpertCard import", s.includes("ExpertCard"))
console.log("has OOH config", s.includes("OOH_EXPERT_CHANNEL_CONFIG"))
console.log("has FormField", s.includes("FormField"))
console.log("has ChevronDown", s.includes("ChevronDown"))
console.log("has CardFooter", s.includes("CardFooter"))
console.log("has Input import", s.includes('from "@/components/ui/input"'))
console.log("has serializeBurstsJson", s.includes("serializeBurstsJson"))
