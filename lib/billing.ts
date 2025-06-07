import { BillingMonth, DailyBilling, BillingOverride } from "@/types/billing";
import { differenceInDays, eachDayOfInterval, format, startOfMonth, endOfMonth, parse, addMonths, isWithinInterval, getDaysInMonth } from "date-fns";

export function calculateBurstBilling(
  startDate: Date,
  endDate: Date,
  totalAmount: number,
  mediaType: string,
  feePercentage: number,
  clientPaysForMedia: boolean
): DailyBilling[] {
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const dailyMediaAmount = totalAmount / totalDays;
  const dailyFeeAmount = (dailyMediaAmount * (feePercentage / 100));

  return eachDayOfInterval({ start: startDate, end: endDate }).map((date) => ({
    date: format(date, 'yyyy-MM-dd'),
    mediaTypeAmounts: {
      [mediaType]: {
        media: clientPaysForMedia ? 0 : dailyMediaAmount,
        fee: dailyFeeAmount,
        isOverridden: false,
        manualMediaAmount: null,
        manualFeeAmount: null
      }
    },
    totalAmount: (clientPaysForMedia ? 0 : dailyMediaAmount) + dailyFeeAmount
  }));
}

export function calculateDailyBilling(
  campaignStartDate: Date,
  campaignEndDate: Date,
  bursts: {
    startDate: Date;
    endDate: Date;
    totalAmount: number;
    mediaType: string;
    feePercentage: number;
    clientPaysForMedia: boolean;
    budgetIncludesFees: boolean;
  }[]
): DailyBilling[] {
  // Create a map to store daily totals
  const daysMap = new Map<string, DailyBilling>();

  // Get all days in the campaign period
  const campaignDays = eachDayOfInterval({ start: campaignStartDate, end: campaignEndDate });

  // Initialize all days with empty amounts
  campaignDays.forEach(day => {
    const dateStr = format(day, 'yyyy-MM-dd');
    daysMap.set(dateStr, {
      date: dateStr,
      mediaTypeAmounts: {},
      totalAmount: 0
    });
  });

  // Process each burst
  bursts.forEach(burst => {
    const { startDate, endDate, totalAmount, mediaType, feePercentage, clientPaysForMedia, budgetIncludesFees } = burst;
    
    // Calculate daily amounts
    const days = differenceInDays(endDate, startDate) + 1;
    let dailyMediaAmount: number;
    let dailyFeeAmount: number;

    if (budgetIncludesFees) {
      const mediaAmount = (totalAmount / 100) * (100 - feePercentage);
      dailyMediaAmount = mediaAmount / days;
      dailyFeeAmount = (totalAmount - mediaAmount) / days;
    } else {
      dailyMediaAmount = totalAmount / days;
      dailyFeeAmount = (dailyMediaAmount * (feePercentage / 100));
    }

    if (clientPaysForMedia) {
      dailyMediaAmount = 0;
    }

    // Get all days in the burst
    const daysInBurst = eachDayOfInterval({ start: startDate, end: endDate });

    // Distribute amounts across days
    daysInBurst.forEach(day => {
      const dateStr = format(day, 'yyyy-MM-dd');
      const dayEntry = daysMap.get(dateStr);
      
      if (dayEntry) {
        // Initialize media type amounts if not exists
        if (!dayEntry.mediaTypeAmounts[mediaType]) {
          dayEntry.mediaTypeAmounts[mediaType] = {
            media: 0,
            fee: 0,
            isOverridden: false,
            manualMediaAmount: null,
            manualFeeAmount: null
          };
        }

        // Add daily amounts
        dayEntry.mediaTypeAmounts[mediaType].media += dailyMediaAmount;
        dayEntry.mediaTypeAmounts[mediaType].fee += dailyFeeAmount;
        dayEntry.totalAmount += dailyMediaAmount + dailyFeeAmount;
      }
    });
  });

  // Convert map to array and sort chronologically
  return Array.from(daysMap.values()).sort((a, b) => 
    parse(a.date, 'yyyy-MM-dd', new Date()).getTime() - 
    parse(b.date, 'yyyy-MM-dd', new Date()).getTime()
  );
}

export function aggregateMonthlyBilling(dailyBilling: DailyBilling[]): BillingMonth[] {
  const monthsMap = new Map<string, BillingMonth>();

  dailyBilling.forEach((daily) => {
    const monthYear = format(parse(daily.date, 'yyyy-MM-dd', new Date()), 'yyyy-MM');
    let month = monthsMap.get(monthYear);

    if (!month) {
      month = {
        monthYear,
        mediaTypeAmounts: {},
        totalAmount: 0,
      };
      monthsMap.set(monthYear, month);
    }

    // Process each media type in the daily billing
    Object.entries(daily.mediaTypeAmounts).forEach(([mediaType, amounts]) => {
      if (!month.mediaTypeAmounts[mediaType]) {
        month.mediaTypeAmounts[mediaType] = {
          media: 0,
          fee: 0,
          isOverridden: false,
          manualMediaAmount: null,
          manualFeeAmount: null,
        };
      }

      const monthAmounts = month.mediaTypeAmounts[mediaType];
      monthAmounts.media += amounts.media;
      monthAmounts.fee += amounts.fee;
      month.totalAmount += amounts.media + amounts.fee;
    });
  });

  // Sort months chronologically
  return Array.from(monthsMap.values()).sort((a, b) => {
    const dateA = parse(a.monthYear, 'yyyy-MM', new Date());
    const dateB = parse(b.monthYear, 'yyyy-MM', new Date());
    return dateA.getTime() - dateB.getTime();
  });
}

export function validateBillingOverrides(
  originalBilling: BillingMonth[],
  overrides: BillingMonth[]
): { isValid: boolean; totalDifference: number; errorMessage?: string } {
  const originalTotal = originalBilling.reduce((sum, month) => sum + month.totalAmount, 0);
  const overrideTotal = overrides.reduce((sum, month) => sum + month.totalAmount, 0);
  const totalDifference = overrideTotal - originalTotal;
  const isValid = Math.abs(totalDifference) <= 0.01;

  let errorMessage: string | undefined;
  if (!isValid) {
    if (totalDifference > 0.01) {
      errorMessage = `Total override amount exceeds original by $${totalDifference.toFixed(2)}. Please adjust to match within $0.01.`;
    } else if (totalDifference < -0.01) {
      errorMessage = `Total override amount is $${Math.abs(totalDifference).toFixed(2)} less than original. Please adjust to match within $0.01.`;
    }
  }

  return {
    isValid,
    totalDifference,
    errorMessage
  };
}

export function calculateMonthlyDistribution(
  campaignStartDate: Date,
  campaignEndDate: Date,
  bursts: {
    startDate: Date;
    endDate: Date;
    totalAmount: number;
    mediaType: string;
    feePercentage: number;
    clientPaysForMedia: boolean;
    budgetIncludesFees: boolean;
  }[]
): BillingMonth[] {
  // Create a map to store monthly totals
  const monthsMap = new Map<string, BillingMonth>();

  // Generate all months between campaign start and end dates
  let current = new Date(campaignStartDate);
  while (current <= campaignEndDate) {
    const monthYear = format(current, 'yyyy-MM');
    monthsMap.set(monthYear, {
      monthYear,
      mediaTypeAmounts: {},
      totalAmount: 0
    });
    current = addMonths(current, 1);
  }

  // Process each burst
  bursts.forEach(burst => {
    const { startDate, endDate, totalAmount, mediaType, feePercentage, clientPaysForMedia, budgetIncludesFees } = burst;
    
    // Calculate daily amounts
    const days = differenceInDays(endDate, startDate) + 1;
    let dailyMediaAmount: number;
    let dailyFeeAmount: number;

    if (budgetIncludesFees) {
      const mediaAmount = (totalAmount / 100) * (100 - feePercentage);
      dailyMediaAmount = mediaAmount / days;
      dailyFeeAmount = (totalAmount - mediaAmount) / days;
    } else {
      dailyMediaAmount = totalAmount / days;
      dailyFeeAmount = (dailyMediaAmount * (feePercentage / 100));
    }

    if (clientPaysForMedia) {
      dailyMediaAmount = 0;
    }

    // Get all days in the burst
    const daysInBurst = eachDayOfInterval({ start: startDate, end: endDate });

    // Distribute amounts across months
    daysInBurst.forEach(day => {
      const monthYear = format(day, 'yyyy-MM');
      const month = monthsMap.get(monthYear);
      
      if (month) {
        // Initialize media type amounts if not exists
        if (!month.mediaTypeAmounts[mediaType]) {
          month.mediaTypeAmounts[mediaType] = {
            media: 0,
            fee: 0,
            isOverridden: false,
            manualMediaAmount: null,
            manualFeeAmount: null
          };
        }

        // Add daily amounts to the month
        const amounts = month.mediaTypeAmounts[mediaType];
        amounts.media += dailyMediaAmount;
        amounts.fee += dailyFeeAmount;
        month.totalAmount += dailyMediaAmount + dailyFeeAmount;
      }
    });
  });

  // Sort months chronologically
  return Array.from(monthsMap.values()).sort((a, b) => {
    const dateA = parse(a.monthYear, 'yyyy-MM', new Date());
    const dateB = parse(b.monthYear, 'yyyy-MM', new Date());
    return dateA.getTime() - dateB.getTime();
  });
} 