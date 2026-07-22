const fs = require("fs")

const path =
  "C:/Projects/avmediaplan/.worktrees/refactor-expertgrid-consolidation/components/media-containers/TelevisionContainer.tsx"
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

const oldBlock = s.slice(start, end + endMarker.length)

const burstStart = oldBlock.indexOf("                      <BurstSection>")
const burstEnd = oldBlock.indexOf("                      </BurstSection>")
if (burstStart < 0 || burstEnd < 0) {
  console.error("BurstSection markers not found", burstStart, burstEnd)
  process.exit(1)
}
const burstSection =
  oldBlock.slice(burstStart, burstEnd + "                      </BurstSection>".length)

const replacement = `                  return (
                    <ExpertCard<TelevisionFormValues>
                      key={field.id}
                      config={TELEVISION_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="televisionlineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(\`televisionlineItems.\${lineItemIndex}.budgetIncludesFees\`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feetelevision || 0))) * (feetelevision || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      stationOptions={filteredTvStations.map((tvStation) => ({
                        value: tvStation.station || \`station-\${tvStation.id}\`,
                        label: tvStation.station || "(Unnamed station)",
                      }))}
                      feePct={feetelevision || 0}
                      calculatedVariant="cpc"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(\`televisionlineItems.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
                      }}
                      onFieldValueChange={(key, li, value) => {
                        if (key !== "size") return;
                        const bursts = form.getValues(\`televisionlineItems.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => {
                          form.setValue(
                            \`televisionlineItems.\${li}.bursts.\${bi}.size\`,
                            value,
                            { shouldDirty: true }
                          );
                        });
                      }}
                      fieldAdornments={{
                        station: (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-auto p-1"
                            onClick={() => {
                              const currentNetworkInForm = form.getValues(
                                \`televisionlineItems.\${lineItemIndex}.network\`
                              );
                              if (!currentNetworkInForm) {
                                toast({
                                  title: "Select a Network First",
                                  description: "Please select a network before adding a station.",
                                  variant: "default",
                                });
                                return;
                              }
                              setCurrentLineItemIndexForNewStation(lineItemIndex);
                              setNewStationName("");
                              setNewStationNetwork(currentNetworkInForm);
                              setIsAddStationDialogOpen(true);
                            }}
                          >
                            <PlusCircle className="h-5 w-5 text-primary" />
                          </Button>
                        ),
                      }}
                      comboboxPropsByKey={{
                        station: {
                          disabled: !selectedNetwork,
                          placeholder: selectedNetwork
                            ? "Select Station"
                            : "Select Network first",
                          searchPlaceholder: "Search stations...",
                          emptyText: selectedNetwork
                            ? \`No stations found for "\${selectedNetwork}".\`
                            : "Select Network first",
                          buttonClassName: "h-9 w-full rounded-md",
                        },
                      }}
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Network:</span>{" "}
                              {form.watch(\`televisionlineItems.\${lineItemIndex}.network\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(\`televisionlineItems.\${lineItemIndex}.buyType\`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Station:</span>{" "}
                              {form.watch(\`televisionlineItems.\${lineItemIndex}.station\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {
                                form.watch(
                                  \`televisionlineItems.\${lineItemIndex}.bursts\`,
                                  []
                                ).length
                              }
                            </div>
                          </div>
                        </div>
                      }
                      burstsSlot={
${burstSection}
                      }
                      footer={
                        <>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive/70 hover:text-destructive hover:bg-destructive/10"
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
                                    bidStrategy: "",
                                    station: "",
                                    daypart: "",
                                    placement: "",
                                    buyType: "",
                                    creativeTargeting: "",
                                    creative: "",
                                    size: "30s",
                                    tarps: "",
                                    buyingDemo: "",
                                    market: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    ...(() => {
                                      const nextNum = lineItemFields.length + 1;
                                      const id = createLineItemId(nextNum);
                                      return { lineItemId: id, line_item_id: id };
                                    })(),
                                    line_item: lineItemFields.length + 1,
                                    lineItem: lineItemFields.length + 1,
                                    bursts: [
                                      {
                                        budget: "",
                                        buyAmount: "",
                                        startDate: new Date(),
                                        endDate: new Date(),
                                        size: "30s",
                                        tarps: "",
                                        calculatedValue: 0,
                                        fee: 0,
                                        _reactKey: newBurstReactKey(),
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
                  );
                })}`

s = s.slice(0, start) + replacement + s.slice(end + endMarker.length)
fs.writeFileSync(path, s)
console.log("replaced", end - start, "chars with", replacement.length)
