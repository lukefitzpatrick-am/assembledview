/**
 * One-shot dump for P-1 Radio / Cinema / DigiVideo goldens.
 * Uses the same week builder as expertGridGoldenParity.test.ts.
 * Run: npx tsx lib/mediaplan/__tests__/_dumpP1Goldens.ts
 */
import { format, startOfDay } from "date-fns";
import {
  mapCinemaExpertRowsToStandardLineItems,
  mapDigiVideoExpertRowsToStandardLineItems,
  mapRadioExpertRowsToStandardLineItems,
} from "../expertChannelMappings";
import type {
  CinemaExpertScheduleRow,
  DigiVideoExpertScheduleRow,
  RadioExpertScheduleRow,
} from "../expertModeWeeklySchedule";
import { buildWeeklyGanttColumnsFromCampaign } from "../../utils/weeklyGanttColumns";

const CS = new Date(2026, 0, 5);
const CE = new Date(2026, 0, 25);
const weekColumns = buildWeeklyGanttColumnsFromCampaign(CS, CE);
const weekKeys = weekColumns.map((c) => c.weekKey);
console.error("weekKeys", weekKeys);

function emptyWeekly(): Record<string, string | number> {
  const o: Record<string, string | number> = {};
  for (const k of weekKeys) o[k] = "";
  return o;
}

const RADIO_ROWS: RadioExpertScheduleRow[] = [
  {
    id: "R1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "SCA",
    station: "2DAY",
    market: "SYD",
    placement: "Breakfast",
    duration: "30s",
    format: "Spot",
    buyingDemo: "A25-54",
    buyType: "spots",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 250,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 10, [weekKeys[1]]: 5 },
    mergedWeekSpans: [],
  },
  {
    id: "R2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "ARN",
    station: "KIIS",
    market: "MEL",
    placement: "",
    duration: "",
    format: "",
    buyingDemo: "",
    buyType: "package_inclusions",
    fixedCostMedia: true,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 0,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 100 },
    mergedWeekSpans: [],
  },
];

const CINEMA_ROWS: CinemaExpertScheduleRow[] = [
  {
    id: "C1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "Event",
    station: "Bondi",
    market: "SYD",
    placement: "Pre-show",
    duration: "30s",
    format: "Spot",
    buyingDemo: "A18-39",
    buyType: "spots",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 180,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 8, [weekKeys[1]]: 4 },
    mergedWeekSpans: [],
  },
  {
    id: "C2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    network: "HOYTS",
    station: "Chadstone",
    market: "MEL",
    placement: "",
    duration: "",
    format: "",
    buyingDemo: "",
    buyType: "bonus",
    fixedCostMedia: false,
    clientPaysForMedia: true,
    budgetIncludesFees: false,
    unitRate: 0,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 50 },
    mergedWeekSpans: [],
  },
];

const DIGI_VIDEO_ROWS: DigiVideoExpertScheduleRow[] = [
  {
    id: "DV1",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "YouTube",
    publisher: "Google",
    site: "yt.com",
    bidStrategy: "views",
    buyType: "cpv",
    placement: "instream",
    size: "15s",
    creativeTargeting: "ctx",
    creative: "v1",
    buyingDemo: "A25-54",
    market: "AU",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: true,
    unitRate: 0.05,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 15000, [weekKeys[1]]: 5000 },
    mergedWeekSpans: [],
  },
  {
    id: "DV2",
    startDate: "2026-01-05",
    endDate: "2026-01-25",
    platform: "Meta",
    publisher: "Meta",
    site: "",
    bidStrategy: "",
    buyType: "cpm",
    placement: "",
    size: "",
    creativeTargeting: "",
    creative: "",
    buyingDemo: "",
    market: "",
    fixedCostMedia: false,
    clientPaysForMedia: false,
    budgetIncludesFees: false,
    unitRate: 12,
    grossCost: 0,
    weeklyValues: { ...emptyWeekly(), [weekKeys[0]]: 80000 },
    mergedWeekSpans: [],
  },
];

function serBurst(b: {
  budget: string;
  buyAmount: string;
  startDate: Date;
  endDate: Date;
  calculatedValue: number;
}) {
  return {
    budget: b.budget,
    buyAmount: b.buyAmount,
    startDate: format(startOfDay(b.startDate), "yyyy-MM-dd"),
    endDate: format(startOfDay(b.endDate), "yyyy-MM-dd"),
    calculatedValue: b.calculatedValue,
  };
}

function serLine(l: {
  bursts: Array<{
    budget: string;
    buyAmount: string;
    startDate: Date;
    endDate: Date;
    calculatedValue: number;
  }>;
  [k: string]: unknown;
}) {
  const { bursts, ...rest } = l;
  return { ...rest, bursts: bursts.map(serBurst) };
}

import { writeFileSync } from "node:fs"
import { join } from "node:path"

const FEE = 10
const payload = {
  radio: mapRadioExpertRowsToStandardLineItems(RADIO_ROWS, weekColumns, CS, CE, {
    feePctRadio: FEE,
  }).map(serLine),
  cinema: mapCinemaExpertRowsToStandardLineItems(CINEMA_ROWS, weekColumns, CS, CE, {
    feePctCinema: FEE,
  }).map(serLine),
  digiVideo: mapDigiVideoExpertRowsToStandardLineItems(
    DIGI_VIDEO_ROWS,
    weekColumns,
    CS,
    CE,
    { feePctDigiVideo: FEE }
  ).map(serLine),
}
const outPath = join(process.cwd(), "dump_p1.json")
writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8")
console.error("weekKeys", weekKeys)
console.error("wrote", outPath)
