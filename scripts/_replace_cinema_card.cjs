const fs = require("fs");
const path = require("path");

const file = path.join(
  __dirname,
  "../components/media-containers/CinemaContainer.tsx"
);
let s = fs.readFileSync(file, "utf8");

const startMarker =
  '                  return (\n                    <Card key={field.id} className="overflow-hidden border border-border/50 shadow-sm hover:shadow-md transition-shadow duration-200 space-y-6">';
const endMarker =
  "                    </Card>\n                  );\n                })}";

const start = s.indexOf(startMarker);
if (start < 0) {
  console.error("start marker not found");
  process.exit(1);
}
const end = s.indexOf(endMarker, start);
if (end < 0) {
  console.error("end marker not found");
  process.exit(1);
}

const replacement = `                  return (
                    <ExpertCard<CinemaFormValues>
                      key={field.id}
                      config={CINEMA_EXPERT_CHANNEL_CONFIG}
                      form={form}
                      itemsKey="cinemalineItems"
                      lineItemIndex={lineItemIndex}
                      lineItemId={lineItemId}
                      collapsed={collapsedLineItems.has(lineItemIndex)}
                      onToggleCollapsed={() => toggleLineItemCollapsed(lineItemIndex)}
                      totalDisplay={formatMoney(
                        form.getValues(\`cinemalineItems.\${lineItemIndex}.budgetIncludesFees\`)
                          ? totalMedia
                          : totalMedia + (totalMedia / (100 - (feecinema || 0))) * (feecinema || 0),
                        { locale: "en-AU", currency: "AUD" }
                      )}
                      publishers={publishers}
                      stationOptions={cinemaStations.map((station) => ({
                        value: station.station || \`station-\${station.id}\`,
                        label: station.station || "(Unnamed station)",
                      }))}
                      feePct={feecinema || 0}
                      calculatedVariant="cinema"
                      campaignStartDate={campaignStartDate}
                      campaignEndDate={campaignEndDate}
                      onBurstValueChange={handleValueChange}
                      onAppendBurst={handleAppendBurst}
                      onDuplicateBurst={(li, _bi) => handleDuplicateBurst(li)}
                      onRemoveBurst={handleRemoveBurst}
                      onBudgetIncludesFeesChange={(li, checked) => {
                        const bursts = form.getValues(\`cinemalineItems.\${li}.bursts\`) || [];
                        bursts.forEach((_, bi) => handleValueChange(li, bi, !!checked));
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
                                \`cinemalineItems.\${lineItemIndex}.network\`
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
                      summaryRow={
                        <div className="border-b px-6 py-2">
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="font-medium">Network:</span>{" "}
                              {form.watch(\`cinemalineItems.\${lineItemIndex}.network\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Buy Type:</span>{" "}
                              {formatBuyTypeForDisplay(
                                form.watch(\`cinemalineItems.\${lineItemIndex}.buyType\`)
                              )}
                            </div>
                            <div>
                              <span className="font-medium">Bid Strategy:</span>{" "}
                              {form.watch(\`cinemalineItems.\${lineItemIndex}.bidStrategy\`) ||
                                "Not selected"}
                            </div>
                            <div>
                              <span className="font-medium">Bursts:</span>{" "}
                              {form.watch(\`cinemalineItems.\${lineItemIndex}.bursts\`, []).length}
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
                                      } as CinemaFormValues["cinemalineItems"][number]["bursts"][number] & {
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
                  );
                })}`;

s = s.slice(0, start) + replacement + s.slice(end + endMarker.length);
fs.writeFileSync(file, s);
console.log("CinemaContainer card replaced OK");
