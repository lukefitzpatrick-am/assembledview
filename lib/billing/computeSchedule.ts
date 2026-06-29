import { format } from "date-fns";
import { computeAdServingCost } from "./computeAdServingCost";
import { prorateAcrossMonths } from "./prorateAcrossMonths";
import type { BillingBurst, BillingMonth } from "./types";

type MonthEntry = {
  totalMedia: number;
  totalFee: number;
  adServing: number;
  productionTotal: number;
  mediaCosts: Record<string, number>;
};

type DistributeMediaType =
  | "search"
  | "socialMedia"
  | "progAudio"
  | "cinema"
  | "digiAudio"
  | "digiDisplay"
  | "digiVideo"
  | "progDisplay"
  | "progVideo"
  | "progBvod"
  | "progOoh"
  | "television"
  | "radio"
  | "newspaper"
  | "magazines"
  | "ooh"
  | "bvod"
  | "integration"
  | "influencers"
  | "production";

export type ComputeBillingAndDeliveryMonthsParams = {
  campaignStart: Date;
  campaignEnd: Date;
  burstsByMediaType: Record<string, BillingBurst[]>;
  getRateForMediaType: (mediaType: string) => number;
  adservaudio: number;
  /** Included for call-site parity with the editor; not used in the numeric schedule itself. */
  isManualBilling: boolean;
};

/**
 * Pure computation of billing + delivery month rows from bursts and campaign dates.
 * Mirrors the media plan editor’s calculateBillingSchedule core (no React state).
 */
export function computeBillingAndDeliveryMonths(
  params: ComputeBillingAndDeliveryMonthsParams
): { billingMonths: BillingMonth[]; deliveryMonths: BillingMonth[] } {
  const { campaignStart: start, campaignEnd: end, burstsByMediaType, getRateForMediaType, adservaudio } =
    params;

  if (!start || !end) {
    return { billingMonths: [], deliveryMonths: [] };
  }

  const billingMap: Record<string, MonthEntry> = {};
  const deliveryMap: Record<string, MonthEntry> = {};

  let cur = new Date(start);
  while (cur <= end) {
    const key = format(cur, "MMMM yyyy");
    const base: MonthEntry = {
      totalMedia: 0,
      totalFee: 0,
      adServing: 0,
      productionTotal: 0,
      mediaCosts: {
        search: 0,
        socialMedia: 0,
        progAudio: 0,
        cinema: 0,
        digiAudio: 0,
        digiDisplay: 0,
        digiVideo: 0,
        progDisplay: 0,
        progVideo: 0,
        progBvod: 0,
        progOoh: 0,
        television: 0,
        radio: 0,
        newspaper: 0,
        magazines: 0,
        ooh: 0,
        bvod: 0,
        integration: 0,
        influencers: 0,
        production: 0,
      },
    };
    billingMap[key] = { ...base, mediaCosts: { ...base.mediaCosts } };
    deliveryMap[key] = { ...base, mediaCosts: { ...base.mediaCosts } };
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  function distribute(burst: BillingBurst, mediaType: DistributeMediaType) {
    const monthKeys = Object.keys(billingMap);
    const billingMediaShares = prorateAcrossMonths({
      amount: burst.mediaAmount,
      burstStart: burst.startDate,
      burstEnd: burst.endDate,
      monthKeys,
    });
    const deliveryMediaShares = prorateAcrossMonths({
      amount: burst.deliveryMediaAmount ?? burst.mediaAmount,
      burstStart: burst.startDate,
      burstEnd: burst.endDate,
      monthKeys,
    });
    const feeShares = prorateAcrossMonths({
      amount: burst.feeAmount,
      burstStart: burst.startDate,
      burstEnd: burst.endDate,
      monthKeys,
    });

    for (const key of monthKeys) {
      const billingMediaShare = billingMediaShares[key] ?? 0;
      const deliveryMediaShare = deliveryMediaShares[key] ?? 0;
      const feeShare = feeShares[key] ?? 0;
      if (billingMediaShare === 0 && deliveryMediaShare === 0 && feeShare === 0) continue;

      billingMap[key].mediaCosts[mediaType] += billingMediaShare;
      deliveryMap[key].mediaCosts[mediaType] += deliveryMediaShare;
      if (mediaType === "production") {
        billingMap[key].productionTotal += billingMediaShare;
        deliveryMap[key].productionTotal += deliveryMediaShare;
      } else {
        billingMap[key].totalMedia += billingMediaShare;
        deliveryMap[key].totalMedia += deliveryMediaShare;
      }
      billingMap[key].totalFee += feeShare;
      deliveryMap[key].totalFee += feeShare;
    }
  }

  const b = burstsByMediaType;
  (b.search ?? []).forEach((x) => distribute(x, "search"));
  (b.socialMedia ?? []).forEach((x) => distribute(x, "socialMedia"));
  (b.progAudio ?? []).forEach((x) => distribute(x, "progAudio"));
  (b.cinema ?? []).forEach((x) => distribute(x, "cinema"));
  (b.digiAudio ?? []).forEach((x) => distribute(x, "digiAudio"));
  (b.digiDisplay ?? []).forEach((x) => distribute(x, "digiDisplay"));
  (b.digiVideo ?? []).forEach((x) => distribute(x, "digiVideo"));
  (b.progDisplay ?? []).forEach((x) => distribute(x, "progDisplay"));
  (b.progVideo ?? []).forEach((x) => distribute(x, "progVideo"));
  (b.progBvod ?? []).forEach((x) => distribute(x, "progBvod"));
  (b.progOoh ?? []).forEach((x) => distribute(x, "progOoh"));
  (b.television ?? []).forEach((x) => distribute(x, "television"));
  (b.radio ?? []).forEach((x) => distribute(x, "radio"));
  (b.newspaper ?? []).forEach((x) => distribute(x, "newspaper"));
  (b.magazines ?? []).forEach((x) => distribute(x, "magazines"));
  (b.ooh ?? []).forEach((x) => distribute(x, "ooh"));
  (b.bvod ?? []).forEach((x) => distribute(x, "bvod"));
  (b.integration ?? []).forEach((x) => distribute(x, "integration"));
  (b.influencers ?? []).forEach((x) => distribute(x, "influencers"));
  (b.production ?? []).forEach((x) => distribute(x, "production"));

  const formatter = new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  function distributeAdServing(burst: BillingBurst, mediaType: string) {
    if (burst.noAdserving) return;
    const monthKeys = Object.keys(billingMap);
    const deliverableShares = prorateAcrossMonths({
      amount: burst.deliverables,
      burstStart: burst.startDate,
      burstEnd: burst.endDate,
      monthKeys,
    });

    for (const monthKey of monthKeys) {
      if (!Object.prototype.hasOwnProperty.call(deliverableShares, monthKey)) continue;
      const share = deliverableShares[monthKey] ?? 0;

      const cost = computeAdServingCost({
        quantity: share,
        buyType: burst.buyType || "",
        mediaType,
        rate: getRateForMediaType(mediaType),
        adservaudio,
        adServingRatePct: burst.adServingRatePct,
        adServingImpressions: burst.adServingImpressions,
      });

      billingMap[monthKey].adServing += cost;
      deliveryMap[monthKey].adServing += cost;
    }
  }

  (b.digiAudio ?? []).forEach((x) => distributeAdServing(x, "digiAudio"));
  (b.digiDisplay ?? []).forEach((x) => distributeAdServing(x, "digiDisplay"));
  (b.digiVideo ?? []).forEach((x) => distributeAdServing(x, "digiVideo"));
  (b.bvod ?? []).forEach((x) => distributeAdServing(x, "bvod"));
  (b.progAudio ?? []).forEach((x) => distributeAdServing(x, "progAudio"));
  (b.progVideo ?? []).forEach((x) => distributeAdServing(x, "progVideo"));
  (b.progBvod ?? []).forEach((x) => distributeAdServing(x, "progBvod"));
  (b.progOoh ?? []).forEach((x) => distributeAdServing(x, "progOoh"));
  (b.progDisplay ?? []).forEach((x) => distributeAdServing(x, "progDisplay"));

  const billingMonths: BillingMonth[] = Object.entries(billingMap).map(
    ([monthYear, { totalMedia, totalFee, adServing, productionTotal, mediaCosts }]) => ({
      monthYear,
      mediaTotal: formatter.format(totalMedia),
      feeTotal: formatter.format(totalFee),
      totalAmount: formatter.format(totalMedia + totalFee + adServing + productionTotal),
      adservingTechFees: formatter.format(adServing),
      production: formatter.format(productionTotal || 0),
      mediaCosts: {
        search: formatter.format(mediaCosts.search || 0),
        socialMedia: formatter.format(mediaCosts.socialMedia || 0),
        digiAudio: formatter.format(mediaCosts.digiAudio || 0),
        digiDisplay: formatter.format(mediaCosts.digiDisplay || 0),
        digiVideo: formatter.format(mediaCosts.digiVideo || 0),
        progAudio: formatter.format(mediaCosts.progAudio || 0),
        cinema: formatter.format(mediaCosts.cinema || 0),
        progDisplay: formatter.format(mediaCosts.progDisplay || 0),
        progVideo: formatter.format(mediaCosts.progVideo || 0),
        progBvod: formatter.format(mediaCosts.progBvod || 0),
        progOoh: formatter.format(mediaCosts.progOoh || 0),
        bvod: formatter.format(mediaCosts.bvod || 0),
        television: formatter.format(mediaCosts.television || 0),
        radio: formatter.format(mediaCosts.radio || 0),
        newspaper: formatter.format(mediaCosts.newspaper || 0),
        magazines: formatter.format(mediaCosts.magazines || 0),
        ooh: formatter.format(mediaCosts.ooh || 0),
        integration: formatter.format(mediaCosts.integration || 0),
        influencers: formatter.format(mediaCosts.influencers || 0),
        production: formatter.format(mediaCosts.production || 0),
      },
    })
  );

  const deliveryMonths: BillingMonth[] = Object.entries(deliveryMap).map(
    ([monthYear, { totalMedia, totalFee, adServing, productionTotal, mediaCosts }]) => ({
      monthYear,
      mediaTotal: formatter.format(totalMedia),
      feeTotal: formatter.format(totalFee),
      totalAmount: formatter.format(totalMedia + totalFee + adServing + productionTotal),
      adservingTechFees: formatter.format(adServing),
      production: formatter.format(productionTotal || 0),
      mediaCosts: {
        search: formatter.format(mediaCosts.search || 0),
        socialMedia: formatter.format(mediaCosts.socialMedia || 0),
        digiAudio: formatter.format(mediaCosts.digiAudio || 0),
        digiDisplay: formatter.format(mediaCosts.digiDisplay || 0),
        digiVideo: formatter.format(mediaCosts.digiVideo || 0),
        progAudio: formatter.format(mediaCosts.progAudio || 0),
        cinema: formatter.format(mediaCosts.cinema || 0),
        progDisplay: formatter.format(mediaCosts.progDisplay || 0),
        progVideo: formatter.format(mediaCosts.progVideo || 0),
        progBvod: formatter.format(mediaCosts.progBvod || 0),
        progOoh: formatter.format(mediaCosts.progOoh || 0),
        bvod: formatter.format(mediaCosts.bvod || 0),
        television: formatter.format(mediaCosts.television || 0),
        radio: formatter.format(mediaCosts.radio || 0),
        newspaper: formatter.format(mediaCosts.newspaper || 0),
        magazines: formatter.format(mediaCosts.magazines || 0),
        ooh: formatter.format(mediaCosts.ooh || 0),
        integration: formatter.format(mediaCosts.integration || 0),
        influencers: formatter.format(mediaCosts.influencers || 0),
        production: formatter.format(mediaCosts.production || 0),
      },
    })
  );

  return { billingMonths, deliveryMonths };
}
