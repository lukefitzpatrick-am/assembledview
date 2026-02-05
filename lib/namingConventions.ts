import { format } from "date-fns";
import ExcelJS from "exceljs";
import { LineItem } from "./generateMediaPlan";

type MediaFlags = Record<string, boolean | undefined>;

type NamingInputs = {
  brand: string;
  campaignName: string;
  mbaNumber: string;
  startDate?: Date | null;
  endDate?: Date | null;
  advertiser?: string;
  version?: string | number;
  mediaFlags: MediaFlags;
  items: {
    search: LineItem[];
    socialMedia: LineItem[];
    digiAudio: LineItem[];
    digiDisplay: LineItem[];
    digiVideo: LineItem[];
    bvod: LineItem[];
    integration: LineItem[];
    progDisplay: LineItem[];
    progVideo: LineItem[];
    progBvod: LineItem[];
    progAudio: LineItem[];
    progOoh: LineItem[];
  };
};

type CsvRow = {
  platform: string;
  level: string;
  name: string;
};

type NamingWorkbookInputs = NamingInputs & {
  advertiser: string;
  version?: string | number;
};

function normalize(str?: string | number | null): string {
  if (str === null || str === undefined) return "";
  return String(str).trim();
}

function joinSegments(segments: (string | undefined)[]) {
  return segments
    .map(seg => normalize(seg))
    .filter(Boolean)
    .join("-")
    .toLowerCase();
}

function pickId(item: any, index: number) {
  const candidate =
    item?.line_item_id ??
    item?.lineItemId ??
    item?.lineItemID ??
    item?.line_itemid ??
    item?.lineitem_id ??
    item?.lineitemid ??
    item?.line_item ??
    item?.lineItem ??
    item?.id ??
    item?.ID;
  if (candidate === 0) return "0";
  if (candidate !== undefined && candidate !== null && candidate !== "") return String(candidate);
  return String(index + 1);
}

function getMonth(startDate?: Date | null) {
  if (!startDate) return "";
  try {
    return format(startDate, "MMM-yy").toLowerCase();
  } catch {
    return "";
  }
}

function getPublisher(item: LineItem) {
  return (
    item.network ||
    item.station ||
    item.site ||
    item.title ||
    item.placement ||
    ""
  );
}

function getTargeting(item: LineItem) {
  return (
    item.targeting ||
    item.creativeTargeting ||
    item.buyingDemo ||
    item.daypart ||
    item.bidStrategy ||
    ""
  );
}

function getCreativeDetail(item: LineItem) {
  return (
    item.size ||
    item.duration ||
    item.digitalDuration ||
    item.radioDuration ||
    item.format ||
    ""
  );
}

function getCreativeName(item: LineItem) {
  return item.creative || "";
}

function buildPackageName(opts: {
  brand: string;
  campaign: string;
  month: string;
  publisher: string;
  mediaType: string;
  targeting: string;
}) {
  return joinSegments([
    opts.brand,
    opts.campaign,
    opts.month,
    opts.publisher,
    opts.mediaType,
    opts.targeting,
  ]);
}

function buildLineItemName(opts: {
  brand: string;
  campaign: string;
  publisher?: string;
  mediaType: string;
  creativeDetail: string;
  targeting: string;
  creativeName: string;
}) {
  return joinSegments([
    opts.brand,
    opts.campaign,
    opts.publisher,
    opts.mediaType,
    opts.creativeDetail,
    opts.targeting,
    opts.creativeName,
  ]);
}

export function generateNamingCsv(inputs: NamingInputs): string {
  return "Naming CSV has been replaced by Excel export. Use generateNamingWorkbook instead.";
}

function toNumber(value: any): number {
  const n = parseFloat(String(value ?? "").replace(/[^0-9.-]+/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toDate(value: any): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  // Try ISO or dd/MM/yyyy
  const str = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) {
    const [dd, mm, yyyy] = str.split("/").map(Number);
    const d = new Date(Date.UTC(yyyy, mm - 1, dd));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function fmtDate(value: Date | null | undefined) {
  return value ? format(value, "dd/MM/yyyy") : "";
}

function computeEstimatedRate(item: LineItem) {
  // Use the buy amount/budget on the line item as the estimated rate
  return toNumber((item as any).buyAmount ?? item.deliverablesAmount ?? item.grossMedia ?? 0);
}

const NAMING_HEADERS = [
  "Campaign Name",
  "Line Item Name",
  "Publisher/Network",
  "Site/Bid Strategy",
  "Targeting",
  "Burst Start",
  "Burst End",
  "Burst Budget",
  "Estimated Rate",
];

const MEDIA_SECTION_ORDER: { label: string; key: keyof NamingInputs["items"] }[] = [
  { label: "Search", key: "search" },
  { label: "Social Media", key: "socialMedia" },
  { label: "Digital Audio", key: "digiAudio" },
  { label: "Digital Display", key: "digiDisplay" },
  { label: "Digital Video", key: "digiVideo" },
  { label: "BVOD", key: "bvod" },
  { label: "Integration", key: "integration" },
  { label: "Programmatic Display", key: "progDisplay" },
  { label: "Programmatic Video", key: "progVideo" },
  { label: "Programmatic BVOD", key: "progBvod" },
  { label: "Programmatic Audio", key: "progAudio" },
  { label: "Programmatic OOH", key: "progOoh" },
];

export async function generateNamingWorkbook(inputs: NamingWorkbookInputs): Promise<ExcelJS.Workbook> {
  const {
    brand,
    campaignName,
    advertiser,
    startDate,
    endDate,
    version,
    items,
  } = inputs;

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Naming Conventions");

  // Header block
  const headerRows: Array<[string, string]> = [
    ["Advertiser", advertiser || ""],
    ["Campaign Name", campaignName || ""],
    ["Start Date", fmtDate(startDate || null)],
    ["End Date", fmtDate(endDate || null)],
    ["Version", version !== undefined && version !== null ? String(version) : ""],
  ];

  headerRows.forEach(([label, value], idx) => {
    const row = idx + 1;
    sheet.getCell(row, 1).value = label;
    sheet.getCell(row, 1).font = { bold: true };
    sheet.getCell(row, 2).value = value;
  });

  let currentRow = headerRows.length + 2;

  // Column widths
  const widths = [22, 45, 28, 28, 30, 15, 15, 18, 18];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  MEDIA_SECTION_ORDER.forEach(section => {
    const list = items[section.key] || [];
    if (!list || list.length === 0) return;

    // Section title
    sheet.mergeCells(currentRow, 1, currentRow, NAMING_HEADERS.length);
    const titleCell = sheet.getCell(currentRow, 1);
    titleCell.value = section.label;
    titleCell.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF000000" } };
    currentRow++;

    // Header row
    NAMING_HEADERS.forEach((h, idx) => {
      const cell = sheet.getCell(currentRow, idx + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    });
    currentRow++;

    list.forEach((item, idx) => {
      const bursts = Array.isArray((item as any).bursts) && (item as any).bursts.length > 0
        ? (item as any).bursts as any[]
        : [{
            startDate: item.startDate,
            endDate: item.endDate,
            deliverablesAmount: item.deliverablesAmount,
            deliverables: item.deliverables,
            buyAmount: (item as any).buyAmount,
            budget: (item as any).budget,
          }];

      const baseName = buildLineItemName({
        brand,
        campaign: campaignName,
        publisher: getPublisher(item),
        mediaType: section.label,
        creativeDetail: getCreativeDetail(item),
        targeting: getTargeting(item),
        creativeName: getCreativeName(item),
      });
      const id = pickId(item as any, idx);
      const lineItemName = id ? `${baseName || campaignName}-${id}` : (baseName || campaignName);
      const publisher = getPublisher(item);
      const siteOrBid = item.site || item.bidStrategy || "";
      const targeting = getTargeting(item);

      bursts.forEach((burst: any, burstIdx: number) => {
        const start = toDate(burst.startDate);
        const end = toDate(burst.endDate);
        const budget = toNumber(burst.deliverablesAmount ?? burst.budget ?? burst.grossMedia ?? item.deliverablesAmount ?? item.grossMedia ?? 0);
        const estimatedRate = toNumber(
          burst.buyAmount ??
          burst.budget ??
          burst.deliverablesAmount ??
          (item as any).buyAmount ??
          item.deliverablesAmount ??
          item.grossMedia ??
          0
        );
        const isFirstBurst = burstIdx === 0;
        const rowValues = [
          isFirstBurst ? campaignName : "",
          isFirstBurst ? lineItemName : "",
          isFirstBurst ? publisher : "",
          isFirstBurst ? siteOrBid : "",
          isFirstBurst ? targeting : "",
          start ? start : fmtDate(start),
          end ? end : fmtDate(end),
          budget,
          estimatedRate,
        ];

        rowValues.forEach((val, colIdx) => {
          const cell = sheet.getCell(currentRow, colIdx + 1);
          cell.value = val;
          if (colIdx === 5 || colIdx === 6) {
            if (val instanceof Date) cell.numFmt = "dd/mm/yyyy";
          }
          if (colIdx === 7 || colIdx === 8) {
            cell.numFmt = "$#,##0.00##";
          }
        });
        currentRow++;
      });
    });

    currentRow++; // Spacer between sections
  });

  return workbook;
}