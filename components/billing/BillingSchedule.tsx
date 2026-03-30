import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { addMonths, eachDayOfInterval, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

const usd2Formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export type BillingScheduleType = {
  month: string;
  searchAmount: number;
  socialAmount: number;
  productionAmount: number;
  feeAmount: number;
  totalAmount: number;
}[];

interface BillingScheduleProps {
  searchBursts: {
    startDate: Date;
    endDate: Date;
    budget: number;
    mediaType: string;
    feePercentage: number;
    clientPaysForMedia: boolean;
    budgetIncludesFees: boolean;
  }[];
  socialMediaBursts: {
    startDate: Date;
    endDate: Date;
    budget: number;
    mediaType: string;
    feePercentage: number;
    clientPaysForMedia: boolean;
    budgetIncludesFees: boolean;
  }[];
  productionBursts?: {
    startDate: Date;
    endDate: Date;
    amount: number;
  }[];
  campaignStartDate: Date;
  campaignEndDate: Date;
  campaignBudget: number;
  onBillingScheduleChange: (schedule: BillingScheduleType) => void;
}

function getMonthsBetweenDates(start: Date, end: Date) {
  const months: Date[] = [];
  let current = startOfMonth(start);
  while (current <= endOfMonth(end)) {
    months.push(current);
    current = addMonths(current, 1);
  }
  return months;
}

type BillingBurstDateRange = { startDate: Date; endDate: Date };

function getDaysInMonthForBurst(month: Date, burst: BillingBurstDateRange) {
  const monthStart = startOfMonth(month);
  const monthEnd = endOfMonth(month);
  const burstStart = new Date(burst.startDate);
  const burstEnd = new Date(burst.endDate);

  const days = eachDayOfInterval({
    start: new Date(Math.max(monthStart.getTime(), burstStart.getTime())),
    end: new Date(Math.min(monthEnd.getTime(), burstEnd.getTime())),
  });

  return days.length;
}

function getTotalDaysInBurst(burst: BillingBurstDateRange) {
  const start = new Date(burst.startDate);
  const end = new Date(burst.endDate);
  const days = eachDayOfInterval({ start, end });
  return days.length;
}

export function BillingSchedule({
  searchBursts,
  socialMediaBursts,
  productionBursts = [],
  campaignStartDate,
  campaignEndDate,
  campaignBudget,
  onBillingScheduleChange,
}: BillingScheduleProps) {
  const [isManualBilling, setIsManualBilling] = useState(false);
  const [manualSchedule, setManualSchedule] = useState<BillingScheduleType>([]);
  const [autoSchedule, setAutoSchedule] = useState<BillingScheduleType>([]);

  const calculateAutoBillingSchedule = useCallback(() => {
    const schedule: BillingScheduleType = [];
    const months = getMonthsBetweenDates(campaignStartDate, campaignEndDate);

    months.forEach(month => {
      let searchAmount = 0;
      let socialAmount = 0;
      let feeAmount = 0;
      let productionAmount = 0;

      // Process search bursts
      searchBursts.forEach(burst => {
        const daysInMonth = getDaysInMonthForBurst(month, burst);
        const totalDays = getTotalDaysInBurst(burst);
        
        if (burst.budgetIncludesFees && burst.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          const fee = (burst.budget * (burst.feePercentage || 0)) / 100;
          feeAmount += (fee / totalDays) * daysInMonth;
          // searchAmount stays 0 (client pays media directly)
        } else if (burst.budgetIncludesFees) {
          // Only budgetIncludesFees: budget is gross, split into media and fee
          // Media = Budget * ((100 - Fee) / 100)
          // Fees = Budget * (Fee / 100)
          const media = (burst.budget * (100 - (burst.feePercentage || 0))) / 100;
          const fee = (burst.budget * (burst.feePercentage || 0)) / 100;
          searchAmount += (media / totalDays) * daysInMonth;
          feeAmount += (fee / totalDays) * daysInMonth;
        } else if (burst.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          const fee = (burst.budget / (100 - (burst.feePercentage || 0))) * (burst.feePercentage || 0);
          feeAmount += (fee / totalDays) * daysInMonth;
          // searchAmount stays 0 (client pays media directly)
        } else {
          // Neither: budget is net media, fee calculated on top
          // Media = Budget (unchanged)
          // Fees = Budget * (Fee / (100 - Fee))
          searchAmount += (burst.budget / totalDays) * daysInMonth;
          const fee = (burst.budget * (burst.feePercentage || 0)) / (100 - (burst.feePercentage || 0));
          feeAmount += (fee / totalDays) * daysInMonth;
        }
      });

      // Process social media bursts
      socialMediaBursts.forEach(burst => {
        const daysInMonth = getDaysInMonthForBurst(month, burst);
        const totalDays = getTotalDaysInBurst(burst);
        
        if (burst.budgetIncludesFees && burst.clientPaysForMedia) {
          // Both true: budget is gross, extract fee only, mediaAmount = 0
          // Media = 0
          // Fees = Budget * (Fee / 100)
          const fee = (burst.budget * (burst.feePercentage || 0)) / 100;
          feeAmount += (fee / totalDays) * daysInMonth;
          // socialAmount stays 0 (client pays media directly)
        } else if (burst.budgetIncludesFees) {
          // Only budgetIncludesFees: budget is gross, split into media and fee
          // Media = Budget * ((100 - Fee) / 100)
          // Fees = Budget * (Fee / 100)
          const media = (burst.budget * (100 - (burst.feePercentage || 0))) / 100;
          const fee = (burst.budget * (burst.feePercentage || 0)) / 100;
          socialAmount += (media / totalDays) * daysInMonth;
          feeAmount += (fee / totalDays) * daysInMonth;
        } else if (burst.clientPaysForMedia) {
          // Only clientPaysForMedia: budget is net media, only fee is billed
          const fee = (burst.budget / (100 - (burst.feePercentage || 0))) * (burst.feePercentage || 0);
          feeAmount += (fee / totalDays) * daysInMonth;
          // socialAmount stays 0 (client pays media directly)
        } else {
          // Neither: budget is net media, fee calculated on top
          // Media = Budget (unchanged)
          // Fees = Budget * (Fee / (100 - Fee))
          socialAmount += (burst.budget / totalDays) * daysInMonth;
          const fee = (burst.budget * (burst.feePercentage || 0)) / (100 - (burst.feePercentage || 0));
          feeAmount += (fee / totalDays) * daysInMonth;
        }
      });

      // Process production bursts (simple proportional allocation by days)
      productionBursts.forEach(burst => {
        const daysInMonth = getDaysInMonthForBurst(month, burst);
        const totalDays = getTotalDaysInBurst(burst);
        if (totalDays <= 0) return;
        productionAmount += ((burst.amount || 0) / totalDays) * daysInMonth;
      });

      schedule.push({
        month: format(month, "MMMM yyyy"),
        searchAmount: Number(searchAmount.toFixed(2)),
        socialAmount: Number(socialAmount.toFixed(2)),
        productionAmount: Number(productionAmount.toFixed(2)),
        feeAmount: Number(feeAmount.toFixed(2)),
        totalAmount: Number((searchAmount + socialAmount + productionAmount + feeAmount).toFixed(2))
      });
    });

    return schedule;
  }, [
    campaignEndDate,
    campaignStartDate,
    productionBursts,
    searchBursts,
    socialMediaBursts,
  ]);

  useEffect(() => {
    if (!isManualBilling) {
      const schedule = calculateAutoBillingSchedule();
      setAutoSchedule(schedule);
      onBillingScheduleChange(schedule);
    }
  }, [calculateAutoBillingSchedule, isManualBilling, onBillingScheduleChange]);

  const handleManualBillingSave = () => {
    const total = manualSchedule.reduce((sum, month) => sum + month.totalAmount, 0);
    const budgetDiff = Math.abs(total - campaignBudget);

    if (budgetDiff > 10) {
      alert(
        `Total amount (${usd2Formatter.format(total)}) must be within $10 of campaign budget (${usd2Formatter.format(
          campaignBudget
        )})`
      );
      return;
    }

    onBillingScheduleChange(manualSchedule);
    setIsManualBilling(true);
  };

  const handleResetBilling = () => {
    setIsManualBilling(false);
    setManualSchedule([]);
    onBillingScheduleChange(autoSchedule);
  };

  const scheduleTableHeadClass =
    "h-8 px-1.5 py-1 text-[10px] font-medium whitespace-nowrap leading-tight"
  const scheduleTableCellClass = "px-1.5 py-1 text-[10px] tabular-nums leading-tight"

  const showProductionColumn = useMemo(() => {
    const schedule = isManualBilling ? manualSchedule : autoSchedule
    const total = schedule.reduce((s, m) => s + (m.productionAmount || 0), 0)
    return total > 0.005
  }, [isManualBilling, manualSchedule, autoSchedule])

  return (
    <div className="space-y-3 text-sm">
      <div className="flex justify-between items-center gap-2">
        <h3 className="text-base font-medium">Billing Schedule</h3>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline">
              {isManualBilling ? "Reset Billing Schedule" : "Manual Billing Schedule"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Manual Billing Schedule</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <Table className="text-[10px] min-w-0">
                <TableHeader>
                  <TableRow>
                    <TableHead className={scheduleTableHeadClass}>Month</TableHead>
                    <TableHead className={scheduleTableHeadClass}>Search</TableHead>
                    <TableHead className={scheduleTableHeadClass}>Social</TableHead>
                    <TableHead className={scheduleTableHeadClass}>Production</TableHead>
                    <TableHead className={scheduleTableHeadClass}>Fee</TableHead>
                    <TableHead className={scheduleTableHeadClass}>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(isManualBilling ? manualSchedule : autoSchedule).map((month, index) => (
                    <TableRow key={month.month}>
                      <TableCell className={scheduleTableCellClass}>{month.month}</TableCell>
                      <TableCell className={scheduleTableCellClass}>
                        <Input
                          className="h-7 px-1.5 text-[10px]"
                          type="number"
                          value={month.searchAmount}
                          onChange={(e) => {
                            const newSchedule = [...(isManualBilling ? manualSchedule : autoSchedule)];
                            newSchedule[index].searchAmount = Number(e.target.value);
                            newSchedule[index].totalAmount = 
                              newSchedule[index].searchAmount + 
                              newSchedule[index].socialAmount + 
                              newSchedule[index].productionAmount +
                              newSchedule[index].feeAmount;
                            setManualSchedule(newSchedule);
                          }}
                        />
                      </TableCell>
                      <TableCell className={scheduleTableCellClass}>
                        <Input
                          className="h-7 px-1.5 text-[10px]"
                          type="number"
                          value={month.socialAmount}
                          onChange={(e) => {
                            const newSchedule = [...(isManualBilling ? manualSchedule : autoSchedule)];
                            newSchedule[index].socialAmount = Number(e.target.value);
                            newSchedule[index].totalAmount = 
                              newSchedule[index].searchAmount + 
                              newSchedule[index].socialAmount +
                              newSchedule[index].productionAmount + 
                              newSchedule[index].feeAmount;
                            setManualSchedule(newSchedule);
                          }}
                        />
                      </TableCell>
                      <TableCell className={scheduleTableCellClass}>
                        <Input
                          className="h-7 px-1.5 text-[10px]"
                          type="number"
                          value={month.productionAmount}
                          onChange={(e) => {
                            const newSchedule = [...(isManualBilling ? manualSchedule : autoSchedule)];
                            newSchedule[index].productionAmount = Number(e.target.value);
                            newSchedule[index].totalAmount =
                              newSchedule[index].searchAmount +
                              newSchedule[index].socialAmount +
                              newSchedule[index].productionAmount +
                              newSchedule[index].feeAmount;
                            setManualSchedule(newSchedule);
                          }}
                        />
                      </TableCell>
                      <TableCell className={scheduleTableCellClass}>
                        <Input
                          className="h-7 px-1.5 text-[10px]"
                          type="number"
                          value={month.feeAmount}
                          onChange={(e) => {
                            const newSchedule = [...(isManualBilling ? manualSchedule : autoSchedule)];
                            newSchedule[index].feeAmount = Number(e.target.value);
                            newSchedule[index].totalAmount = 
                              newSchedule[index].searchAmount + 
                              newSchedule[index].socialAmount + 
                              newSchedule[index].productionAmount +
                              newSchedule[index].feeAmount;
                            setManualSchedule(newSchedule);
                          }}
                        />
                      </TableCell>
                      <TableCell className={scheduleTableCellClass}>
                        {usd2Formatter.format(month.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between gap-2">
                <div className="text-sm font-medium">
                  Total:{" "}
                  {usd2Formatter.format(
                    (isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.totalAmount, 0)
                  )}
                </div>
                <div className="space-x-2">
                  {isManualBilling ? (
                    <Button onClick={handleResetBilling}>Reset</Button>
                  ) : (
                    <Button onClick={handleManualBillingSave}>Save</Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Table className="text-[10px] min-w-0">
        <TableHeader>
          <TableRow>
            <TableHead className={scheduleTableHeadClass}>Month</TableHead>
            <TableHead className={scheduleTableHeadClass}>Search Amount</TableHead>
            <TableHead className={scheduleTableHeadClass}>Social Amount</TableHead>
            {showProductionColumn ? (
              <TableHead className={scheduleTableHeadClass}>Production Amount</TableHead>
            ) : null}
            <TableHead className={scheduleTableHeadClass}>Fee Amount</TableHead>
            <TableHead className={scheduleTableHeadClass}>Total Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(isManualBilling ? manualSchedule : autoSchedule).map((month) => (
            <TableRow key={month.month}>
              <TableCell className={scheduleTableCellClass}>{month.month}</TableCell>
              <TableCell className={scheduleTableCellClass}>
                {usd2Formatter.format(month.searchAmount)}
              </TableCell>
              <TableCell className={scheduleTableCellClass}>
                {usd2Formatter.format(month.socialAmount)}
              </TableCell>
              {showProductionColumn ? (
                <TableCell className={scheduleTableCellClass}>
                  {usd2Formatter.format(month.productionAmount)}
                </TableCell>
              ) : null}
              <TableCell className={scheduleTableCellClass}>
                {usd2Formatter.format(month.feeAmount)}
              </TableCell>
              <TableCell className={scheduleTableCellClass}>
                {usd2Formatter.format(month.totalAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="text-xs font-medium">
        <div className="grid grid-cols-2 gap-3 min-w-0">
          <div>
            <div>
              Search Total:{" "}
              {usd2Formatter.format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.searchAmount, 0))}
            </div>
            <div>
              Social Total:{" "}
              {usd2Formatter.format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.socialAmount, 0))}
            </div>
            {showProductionColumn ? (
              <div>
                Production Total:{" "}
                {usd2Formatter.format(
                  (isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.productionAmount, 0)
                )}
              </div>
            ) : null}
            <div>
              Fee Total:{" "}
              {usd2Formatter.format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.feeAmount, 0))}
            </div>
          </div>
          <div className="text-right">
            <div>
              Total Campaign Billing Amount:{" "}
              {usd2Formatter.format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.totalAmount, 0))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 