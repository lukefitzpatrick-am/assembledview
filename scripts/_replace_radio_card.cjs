const fs = require("fs")

const path =
  "C:/Projects/avmediaplan/.worktrees/refactor-expertgrid-consolidation/components/media-containers/RadioContainer.tsx"
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
                    <ExpertCard<RadioFormValues>
                      key={field.id}
                      config={RADIO_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="radiolineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(\`radiolineItems.\${lineItemIndex}.budgetIncludesFees\`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feeradio || 0))) * (feeradio || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      stationOptions={filteredRadioStations.map((radioStation) => ({
                        value: radioStation.station || \`station-\${radioStation.id}\`,
                        label: radioStation.station || "(Unnamed station)",
                      }))}
                      feePct={feeradio || 0}
                      calculatedVariant="radio"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(\`radiolineItems.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
                      }}
                      onComboboxValueChange={(key, li, value) => {
                        if (key === "buyType") handleBuyTypeChange(li, value);
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
                                \`radiolineItems.\${lineItemIndex}.network\`
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
                              <span className="font-medium">Netowrk:</span>{" "}
                              {form.watch(\`radiolineItems.\${lineItemIndex}.network\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(\`radiolineItems.\${lineItemIndex}.buyType\`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Bid Strategy:</span>{" "}
                              {form.watch(\`radiolineItems.\${lineItemIndex}.bidStrategy\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(\`radiolineItems.\${lineItemIndex}.bursts\`, []).length}
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
                                    station: "",
                                    bidStrategy: "",
                                    buyType: "",
                                    placement: "",
                                    format: "",
                                    duration: "",
                                    buyingDemo: "",
                                    market: "",
                                    platform: "",
                                    creativeTargeting: "",
                                    creative: "",
                                    fixedCostMedia: false,
                                    clientPaysForMedia: false,
                                    budgetIncludesFees: false,
                                    noadserving: false,
                                    ...(() => {
                                      const nextNumber = lineItemFields.length + 1;
                                      const id = createLineItemId(nextNumber);
                                      return {
                                        lineItemId: id,
                                        line_item_id: id,
                                        line_item: nextNumber,
                                        lineItem: nextNumber,
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
                                    totalMedia: 0,
                                    totalDeliverables: 0,
                                    totalFee: 0,
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
