const fs = require("fs");
const path = require("path");
const file = path.join(__dirname, "../components/media-containers/NewspaperContainer.tsx");
let s = fs.readFileSync(file, "utf8");

if (!s.includes('import { ExpertCard }')) {
  s = s.replace(
    'import { ChevronDown, Plus, Trash2, Copy } from "lucide-react"\n',
    'import { ChevronDown, Plus, Trash2, Copy } from "lucide-react"\n' +
      'import { ExpertCard } from "@/components/media-containers/ExpertCard"\n' +
      'import { NEWSPAPER_EXPERT_CHANNEL_CONFIG } from "@/lib/mediaplan/expertGridChannelConfig"\n'
  );
}

// return ( is 18 spaces; <Card is 20 spaces — do not align them
const startMarker = "                  return (\n                    <Card key={field.id}";
// Outer card close only — leave `})}` in file
const endMarker = "                    </Card>\n                  );";
const start = s.indexOf(startMarker);
const end = start >= 0 ? s.indexOf(endMarker, start) : -1;
if (start < 0 || end < 0) {
  console.error("markers not found", { start, end });
  process.exit(1);
}

const replacement = `                  return (
                    <ExpertCard<NewspapersFormValues>
                      key={field.id}
                      config={NEWSPAPER_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="newspaperlineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(\`newspaperlineItems.\${lineItemIndex}.budgetIncludesFees\`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feenewspapers || 0))) * (feenewspapers || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      dynamicOptionsByKey={{
                        title: filteredNewspapers.map((newspaper) => ({
                          value: newspaper.title || \`title-\${newspaper.id}\`,
                          label: newspaper.title || "(Untitled)",
                        })),
                        size: newspapersAdSizes.map((adSize) => ({
                          value: adSize.adsize || \`adsize-\${adSize.id}\`,
                          label: adSize.adsize || "(Unnamed ad size)",
                        })),
                      }}
                      feePct={feenewspapers || 0}
                      calculatedVariant="newspaper"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li, _bi) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(\`newspaperlineItems.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
                      }}
                      fieldAdornments={{
                        title: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              const currentNetworkInForm = form.getValues(
                                \`newspaperlineItems.\${lineItemIndex}.network\`
                              );
                              if (!currentNetworkInForm) {
                                toast({
                                  title: "Select a Network First",
                                  description: "Please select a network before adding a title.",
                                  variant: "default",
                                });
                                return;
                              }
                              setCurrentLineItemIndexForNewTitle(lineItemIndex);
                              setNewTitleName("");
                              setNewTitleNetwork(currentNetworkInForm);
                              setIsAddTitleDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                        size: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              setCurrentLineItemIndexForNewAdSize(lineItemIndex);
                              setNewAdSizeName("");
                              setIsAddNewspaperAdSizeDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                      }}
                      comboboxPropsByKey={{
                        title: {
                          disabled: !selectedNetwork,
                          placeholder: selectedNetwork
                            ? "Select Title"
                            : "Select Network first",
                          searchPlaceholder: "Search titles...",
                          emptyText: selectedNetwork
                            ? \`No titles found for "\${selectedNetwork}".\`
                            : "Select Network first",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                        size: {
                          placeholder: "Select Ad Size",
                          searchPlaceholder: "Search ad sizes...",
                          emptyText: "No ad sizes found.",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Network:</span>{" "}
                              {form.watch(\`newspaperlineItems.\${lineItemIndex}.network\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(\`newspaperlineItems.\${lineItemIndex}.buyType\`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Title:</span>{" "}
                              {form.watch(\`newspaperlineItems.\${lineItemIndex}.title\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(\`newspaperlineItems.\${lineItemIndex}.bursts\`, []).length}
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
                                    network: "",
                                    publisher: "",
                                    title: "",
                                    buyType: "",
                                    format: "",
                                    size: "",
                                    placement: "",
                                    buyingDemo: "",
                                    market: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    ...(() => {
                                      const nextNum = lineItemFields.length + 1;
                                      const id = createLineItemId(nextNum);
                                      return {
                                        lineItemId: id,
                                        line_item_id: id,
                                        line_item: nextNum,
                                        lineItem: nextNum,
                                      };
                                    })(),
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
                  );`;

s = s.slice(0, start) + replacement + s.slice(end + endMarker.length);
fs.writeFileSync(file, s);
console.log("Newspaper ExpertCard migrate ok");
