const fs = require("fs")

const path =
  "C:/Projects/avmediaplan/.worktrees/refactor-expertgrid-consolidation/components/media-containers/DigitalVideoContainer.tsx"
let s = fs.readFileSync(path, "utf8")

const startMarker =
  '                  return (\n                    <Card key={field.id} className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6">'
const endMarker = "                    </Card>\n                  );\n                })}"

const start = s.indexOf(startMarker)
const end = s.indexOf(endMarker)
if (start < 0 || end < 0) {
  console.error("markers not found", start, end)
  process.exit(1)
}

const replacement = `                  return (
                    <ExpertCard<DigiVideoFormValues>
                      key={field.id}
                      config={DIGIVIDEO_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="digivideolineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(\`digivideolineItems.\${lineItemIndex}.budgetIncludesFees\`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feedigivideo || 0))) * (feedigivideo || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      dynamicOptionsByKey={{
                        site: filteredDigiVideoSites.map((site) => ({
                          value: site.site_name || \`site-\${site.id}\`,
                          label: site.site_name || "(Unnamed site)",
                        })),
                      }}
                      feePct={feedigivideo || 0}
                      calculatedVariant="cpcCpvCpm"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(\`digivideolineItems.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
                        if (key === "publisher") {
                          form.setValue(\`digivideolineItems.\${li}.platform\`, value, {
                            shouldDirty: true,
                          });
                          form.setValue(\`digivideolineItems.\${li}.site\`, "", {
                            shouldDirty: true,
                          });
                        }
                      }}
                      fieldAdornments={{
                        site: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              const currentPublisherInForm = form.getValues(
                                \`digivideolineItems.\${lineItemIndex}.platform\`
                              );
                              if (!currentPublisherInForm) {
                                toast({
                                  title: "Select a Publisher First",
                                  description: "Please select a Publisher before adding a site.",
                                  variant: "default",
                                });
                                return;
                              }
                              setCurrentLineItemIndexForNewSite(lineItemIndex);
                              setNewSiteName("");
                              setNewSitePlatform(selectedPublisher);
                              setIsAddSiteDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                      }}
                      comboboxPropsByKey={{
                        site: {
                          disabled: !selectedPublisher,
                          placeholder: selectedPublisher
                            ? "Select Site"
                            : "Select Publisher first",
                          searchPlaceholder: "Search sites...",
                          emptyText: selectedPublisher
                            ? \`No sites found for "\${selectedPublisher}".\`
                            : "Select Publisher first",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Publisher:</span>{" "}
                              {form.watch(\`digivideolineItems.\${lineItemIndex}.platform\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(\`digivideolineItems.\${lineItemIndex}.buyType\`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Site:</span>{" "}
                              {form.watch(\`digivideolineItems.\${lineItemIndex}.site\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(\`digivideolineItems.\${lineItemIndex}.bursts\`, []).length}
                            </div>
                          </div>
                        </div>
                      }
                      footer={
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive/70 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => removeLineItem(lineItemIndex)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Remove
                          </Button>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => handleDuplicateLineItem(lineItemIndex)}
                            >
                              <Copy className="mr-1.5 h-3.5 w-3.5" />
                              Duplicate
                            </Button>
                            {lineItemIndex === lineItemFields.length - 1 && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() =>
                                  appendLineItem({
                                    platform: "",
                                    site: "",
                                    bidStrategy: "",
                                    buyType: "",
                                    publisher: "",
                                    placement: "",
                                    size: "",
                                    targetingAttribute: "",
                                    creativeTargeting: "",
                                    creative: "",
                                    buyingDemo: "",
                                    market: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    bursts: [
                                      {
                                        _reactKey: newBurstReactKey(),
                                        budget: "",
                                        buyAmount: "",
                                        startDate: defaultMediaBurstStartDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        endDate: defaultMediaBurstEndDate(
                                          campaignStartDate,
                                          campaignEndDate
                                        ),
                                        calculatedValue: 0,
                                        fee: 0,
                                      } as DigiVideoFormValues["digivideolineItems"][number]["bursts"][number] & {
                                        _reactKey: string;
                                      },
                                    ],
                                  })
                                }
                              >
                                <Plus className="mr-1.5 h-3.5 w-3.5" />
                                Add Line Item
                              </Button>
                            )}
                          </div>
                        </>
                      }
                    />
                  );`

s = s.slice(0, start) + replacement + s.slice(end + endMarker.length)

if (!s.includes('from "@/components/media-containers/ExpertCard"')) {
  s = s.replace(
    'import { Badge } from "@/components/ui/badge"\n',
    'import { Badge } from "@/components/ui/badge"\n' +
      'import { ExpertCard } from "@/components/media-containers/ExpertCard"\n' +
      'import { DIGIVIDEO_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"\n'
  )
}

s = s.replace(
  'import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"',
  'import { Form } from "@/components/ui/form"'
)
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
s = s.replace('import { PlusCircle } from "lucide-react"\n', "")
s = s.replace(
  'import { ChevronDown, Copy, Plus, Trash2 } from "lucide-react"',
  'import { PlusCircle, Copy, Plus, Trash2 } from "lucide-react"'
)
s = s.replace(
  'import { formatAUD, formatMoney, parseMoneyInput } from "@/lib/format/money"',
  'import { formatMoney } from "@/lib/format/money"'
)

s = s.replace(
  /import \{\s*CpcFamilyBurstCalculatedField,\s*getCpcFamilyBurstCalculatedColumnLabel,\s*\} from "@\/components\/media-containers\/burst-calculated-fields"\s*\n/,
  ""
)
s = s.replace(
  /import \{\s*MP_BURST_ACTION_COLUMN,[\s\S]*?MP_BURST_ROW_SHELL,\} from "@\/lib\/mediaplan\/burstSectionLayout"\s*\n/,
  ""
)
s = s.replace(
  'import { SingleDatePicker } from "@/components/ui/single-date-picker"\n',
  ""
)

// Dead helpers that only served the hand-rolled burst UI
s = s.replace(
  /const AD_SERVING_OVERRIDE_BURST_GRID =[\s\S]*?const parseAdServingOverrideInput = \(value: string\) => \{[\s\S]*?\n\}\n\n/,
  ""
)

fs.writeFileSync(path, s)
console.log("DigitalVideoContainer card replaced OK")
console.log("has ExpertCard", s.includes("ExpertCard"))
console.log("has FormField", s.includes("FormField"))
console.log("has CardFooter", s.includes("CardFooter"))
console.log("has MP_BURST", s.includes("MP_BURST"))
