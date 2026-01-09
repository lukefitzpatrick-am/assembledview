import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { addMonths, eachDayOfInterval, startOfMonth, endOfMonth, isWithinInterval } from "date-fns";

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

  // Calculate auto billing schedule
  useEffect(() => {
    if (!isManualBilling) {
      const schedule = calculateAutoBillingSchedule();
      setAutoSchedule(schedule);
      onBillingScheduleChange(schedule);
    }
  }, [searchBursts, socialMediaBursts, campaignStartDate, campaignEndDate]);

  const calculateAutoBillingSchedule = () => {
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
  };

  const getMonthsBetweenDates = (start: Date, end: Date) => {
    const months: Date[] = [];
    let current = startOfMonth(start);
    while (current <= endOfMonth(end)) {
      months.push(current);
      current = addMonths(current, 1);
    }
    return months;
  };

  const getDaysInMonthForBurst = (month: Date, burst: any) => {
    const monthStart = startOfMonth(month);
    const monthEnd = endOfMonth(month);
    const burstStart = new Date(burst.startDate);
    const burstEnd = new Date(burst.endDate);

    const days = eachDayOfInterval({
      start: new Date(Math.max(monthStart.getTime(), burstStart.getTime())),
      end: new Date(Math.min(monthEnd.getTime(), burstEnd.getTime()))
    });

    return days.length;
  };

  const getTotalDaysInBurst = (burst: any) => {
    const start = new Date(burst.startDate);
    const end = new Date(burst.endDate);
    const days = eachDayOfInterval({ start, end });
    return days.length;
  };

  const handleManualBillingSave = () => {
    const total = manualSchedule.reduce((sum, month) => sum + month.totalAmount, 0);
    const budgetDiff = Math.abs(total - campaignBudget);

    if (budgetDiff > 10) {
      alert(`Total amount (${total}) must be within $10 of campaign budget (${campaignBudget})`);
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

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Billing Schedule</h3>
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
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead>Search</TableHead>
                    <TableHead>Social</TableHead>
                <TableHead>Production</TableHead>
                    <TableHead>Fee</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(isManualBilling ? manualSchedule : autoSchedule).map((month, index) => (
                    <TableRow key={month.month}>
                      <TableCell>{month.month}</TableCell>
                      <TableCell>
                        <Input
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
                      <TableCell>
                        <Input
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
                      <TableCell>
                        <Input
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
                      <TableCell>
                        <Input
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
                      <TableCell>
                        {new Intl.NumberFormat('en-US', {
                          style: 'currency',
                          currency: 'USD'
                        }).format(month.totalAmount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="flex justify-between">
                <div className="text-lg font-medium">
                  Total: {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                  }).format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.totalAmount, 0))}
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

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Month</TableHead>
            <TableHead>Search Amount</TableHead>
            <TableHead>Social Amount</TableHead>
            <TableHead>Production Amount</TableHead>
            <TableHead>Fee Amount</TableHead>
            <TableHead>Total Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(isManualBilling ? manualSchedule : autoSchedule).map((month) => (
            <TableRow key={month.month}>
              <TableCell>{month.month}</TableCell>
              <TableCell>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD'
                }).format(month.searchAmount)}
              </TableCell>
              <TableCell>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD'
                }).format(month.socialAmount)}
              </TableCell>
            <TableCell>
              {new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(month.productionAmount)}
            </TableCell>
              <TableCell>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD'
                }).format(month.feeAmount)}
              </TableCell>
              <TableCell>
                {new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD'
                }).format(month.totalAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="text-lg font-medium">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div>Search Total: {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.searchAmount, 0))}</div>
            <div>Social Total: {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.socialAmount, 0))}</div>
                  <div>Production Total: {new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD'
                  }).format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.productionAmount, 0))}</div>
            <div>Fee Total: {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.feeAmount, 0))}</div>
          </div>
          <div className="text-right">
            <div>Total Campaign Billing Amount: {new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD'
            }).format((isManualBilling ? manualSchedule : autoSchedule).reduce((sum, month) => sum + month.totalAmount, 0))}</div>
          </div>
        </div>
      </div>
    </div>
  );
} 