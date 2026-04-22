import ExcelJS from 'exceljs';

const KPI_MEDIA_LABELS: Record<string, string> = {
  television: 'Television', radio: 'Radio', newspaper: 'Newspaper',
  magazines: 'Magazines', ooh: 'OOH', cinema: 'Cinema',
  digiDisplay: 'Digital Display', digiAudio: 'Digital Audio',
  digiVideo: 'Digital Video', bvod: 'BVOD', integration: 'Integration',
  search: 'Search', socialMedia: 'Social Media',
  progDisplay: 'Programmatic Display', progVideo: 'Programmatic Video',
  progBvod: 'Programmatic BVOD', progAudio: 'Programmatic Audio',
  progOoh: 'Programmatic OOH', influencers: 'Influencers',
  production: 'Production',
}

// ARGB strings for ExcelJS (FF = fully opaque)
const KPI_MEDIA_COLORS: Record<string, string> = {
  television: 'FF1565C0', radio: 'FF6A1B9A', newspaper: 'FF37474F',
  magazines: 'FFAD1457', ooh: 'FFE65100', cinema: 'FFB71C1C',
  digiDisplay: 'FF00695C', digiAudio: 'FF1A237E', digiVideo: 'FF4527A0',
  bvod: 'FFF57F17', integration: 'FF2E7D32', search: 'FF1B5E20',
  socialMedia: 'FF0D47A1', progDisplay: 'FF263238', progVideo: 'FF311B92',
  progBvod: 'FFF9A825', progAudio: 'FFBF360C', progOoh: 'FF558B2F',
  influencers: 'FF880E4F', production: 'FF4E342E',
}

// Lighter tint (30% opacity approximation) for subtotal rows
const KPI_MEDIA_TINTS: Record<string, string> = {
  television: 'FFD6E4F5', radio: 'FFE8D5F5', newspaper: 'FFD6DEE1',
  magazines: 'FFF5D0E0', ooh: 'FFF5D5C2', cinema: 'FFF5C2C2',
  digiDisplay: 'FFC8E6E3', digiAudio: 'FFCFD8F5', digiVideo: 'FFD9D1F5',
  bvod: 'FFFDE8C0', integration: 'FFC8E6C9', search: 'FFC8E6C9',
  socialMedia: 'FFCCE0F5', progDisplay: 'FFD1D5D8', progVideo: 'FFD3CCF0',
  progBvod: 'FFFDE8A8', progAudio: 'FFF5D0C5', progOoh: 'FFD7E8C8',
  influencers: 'FFF2CCDC', production: 'FFD8CEC9',
}

export interface MediaPlanHeader {
  logoBase64: string;
  logoWidth: number;
  logoHeight: number;
  client: string;
  brand: string;
  campaignName: string;
  mbaNumber: string;
  clientContact: string;
  planVersion: string;
  poNumber: string;
  campaignBudget: string;
  campaignStatus: string;
  campaignStart: string; // Expected as dd/MM/yyyy
  campaignEnd: string;   // Expected as dd/MM/yyyy
}

export interface KPISheetRow {
  mediaType: string;
  publisher: string;
  label: string;
  buyType: string;
  spend: number;
  deliverables: number;
  ctr: number;
  vtr: number;
  cpv: number;
  conversion_rate: number;
  frequency: number;
  calculatedClicks: number;
  calculatedViews: number;
  calculatedReach: number;
}

export interface Burst { // This is a burst *within* a GroupedItem
  startDate: string; // ISO Date string YYYY-MM-DD
  endDate: string;   // ISO Date string YYYY-MM-DD
  deliverablesAmount: number; // Budget of the burst
  deliverables: number; // Deliverables count for the burst
}

// Consolidated LineItem for data from containers
export interface LineItem {
  market: string;
  line_item_id?: string;
  lineItemId?: string;
  line_item?: number | string;
  lineItem?: number | string;
  buyAmount?: string | number;
  platform?: string;      // Primarily for Search, Social, Programmatic
  network?: string;       // For TV, Radio, OOH, Cinema, Print, Digital (Publisher)
  station?: string;       // For TV, Radio
  bidStrategy?: string;
  objective?: string;     // Influencers, Integration
  campaign?: string;      // Influencers, Integration
  targeting?: string;     // Digital, Search, Social, Programmatic
  creative?: string;      // General creative name/ID
  startDate: string;       // Burst start date: YYYY-MM-DD
  endDate: string;         // Burst end date: YYYY-MM-DD
  deliverables: number | string; // The primary metric (TARPs, Clicks, Impressions, Spots, Panels, Screens, Insertions)
  buyingDemo?: string;
  buyType?: string;
  deliverablesAmount: string; // Raw budget string for the burst (this is often the same as grossMedia for a single burst)
  grossMedia: string;         // Parsed numeric gross media for the burst
  daypart?: string;
  placement?: string;     // Also for OOH, Cinema, Print, Radio
  size?: string;          // Ad Size/Length (TV: "30s", Print: "Full Page", OOH: "Supersite")
  format?: string;        // Format for Radio, Cinema
  duration?: string;      // Duration for Radio, Cinema
  oohFormat?: string;     // e.g., "Billboard", "Street Furniture"
  oohType?: string;       // e.g., "Digital", "Static"
  panels?: number | string;// Specific deliverable for OOH if not covered by 'deliverables'
  cinemaTarget?: string;  // e.g., "Mainstream", "Arthouse"
  screens?: number | string;// Specific deliverable for Cinema
  title?: string;         // Publication title
  insertions?: number | string; // Specific deliverable for Print
  radioDuration?: string; // Distinct from 'size' if 'size' is for creative name
  spots?: number | string;  // Specific deliverable for Radio
  site?: string;          // Specific site or app
  digitalDuration?: string;// e.g., for video/audio ad length if not 'size'
  clientPaysForMedia?: boolean;
  budgetIncludesFees?: boolean;
  noAdserving?: boolean;
  fixedCostMedia?: boolean;
  creativeTargeting?: string; // often synonymous with 'targeting'
}

/** Payloads may use camelCase (UI) or snake_case (API). */
function lineItemIsClientPaysForMedia(item: LineItem): boolean {
  const o = item as LineItem & { client_pays_for_media?: boolean }
  return o.clientPaysForMedia === true || o.client_pays_for_media === true
}

// Enhanced GroupedItem
export interface GroupedItem {
  market: string;
  platform?: string;
  network?: string;
  station?: string;
  bidStrategy?: string;
  targeting?: string;
  creative?: string;
  buyingDemo?: string;
  buyType?: string;
  daypart?: string;
  placement?: string;
  size?: string;
  format?: string;
  duration?: string;
  oohFormat?: string;
  oohType?: string;
  panels?: number | string;
  cinemaTarget?: string;
  screens?: number | string;
  title?: string;
  insertions?: number | string;
  radioDuration?: string;
  spots?: number | string;
  site?: string;
  digitalDuration?: string;

  // Aggregated values
  deliverablesAmount: number; // Sum of burst budgets (deliverablesAmount from LineItem) for this group
  grossMedia: number;         // Sum of gross media for this group
  totalCalculatedDeliverables: number; // Sum of deliverables (TARPs, Clicks, etc.)

  // Burst details
  bursts: Burst[];
  groupStartDate: string; // Overall start date for the group (YYYY-MM-DD)
  groupEndDate: string;   // Overall end date for the group (YYYY-MM-DD)
  groupKey?: string;       // Internal key used for grouping
}

export interface MediaItems {
  search:         LineItem[];
  socialMedia:    LineItem[];
  digiAudio:      LineItem[];
  digiDisplay:    LineItem[];
  digiVideo:      LineItem[];
  bvod:           LineItem[];
  progDisplay:    LineItem[];
  progVideo:      LineItem[];
  progBvod:       LineItem[];
  progOoh:        LineItem[];
  progAudio:      LineItem[];
  newspaper:      LineItem[];
  magazines:      LineItem[];
  television:     LineItem[];
  radio:          LineItem[];
  ooh:            LineItem[];
  cinema:         LineItem[];
  integration:    LineItem[];
  influencers:    LineItem[];
  production:     LineItem[];
}

// Helper to parse YYYY-MM-DD to Date (for burst dates from LineItem)
// Ensures UTC parsing for consistency
function parseDateStringYYYYMMDD(dateStr: string): Date {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    console.warn(`Invalid YYYY-MM-DD date string: ${dateStr}. Using current date as fallback.`);
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); // Fallback to current date UTC
  }
  const parts = dateStr.split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
}

// Helper to parse dd/MM/yyyy to Date
// Ensures UTC parsing for consistency
function parseDateStringDDMMYYYY(dateStr: string): Date {
   if (!dateStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
    console.warn(`Invalid dd/MM/yyyy date string: ${dateStr}. Using current date as fallback.`);
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())); // Fallback to current date UTC
  }
   const parts = dateStr.split('/'); // dd/MM/yyyy
   return new Date(Date.UTC(
     Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])
   ));
}

// format bid strategy code to human readable
function formatBidStrategy(strategyCode: string | undefined): string {
  if (!strategyCode) return '';
  const words = strategyCode.split('_');
  return words
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// format buy type to human readable
function formatBuyType(buyType: string | undefined): string {
  if (!buyType) return '';
  
  // Handle common buy type formats and acronyms
  const buyTypeMap: { [key: string]: string } = {
    'cpt': 'CPT',
    'cpm': 'CPM',
    'cpc': 'CPC',
    'cpv': 'CPV',
    'cpa': 'CPA',
    'cpl': 'CPL',
    'cpi': 'CPI',
    'fixed_cost': 'Fixed Cost',
    'fixed_spot_rate': 'Fixed Spot Rate',
    'sponsorship': 'Sponsorship',
    'spots': 'Spots',
    'reach': 'Reach',
    'frequency': 'Frequency',
    'cpp': 'CPP',
    'cost_per_spot': 'Cost Per Spot',
    'cost_per_thousand': 'Cost Per Thousand',
    'cost_per_point': 'Cost Per Point',
    'cost_per_click': 'CPC',
    'cost_per_view': 'CPV',
    'cost_per_acquisition': 'CPA',
    'cost_per_lead': 'CPL',
    'cost_per_install': 'CPI'
  };
  
  const lowerBuyType = buyType.toLowerCase();
  if (buyTypeMap[lowerBuyType]) {
    return buyTypeMap[lowerBuyType];
  }
  
  // Check if it's already an acronym (all caps or mixed case like "CPC", "cpm", etc.)
  // Common acronym patterns: 2-4 uppercase letters
  const acronymPattern = /^[A-Z]{2,4}$/i;
  if (acronymPattern.test(buyType)) {
    return buyType.toUpperCase();
  }
  
  // If not in map, format by capitalizing words and handling underscores
  return buyType
    .split('_')
    .map(word => {
      // If word looks like an acronym, uppercase it
      if (acronymPattern.test(word)) {
        return word.toUpperCase();
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

// Section title to mediaCosts key mapping for delivery schedule
const SECTION_TO_MEDIA_KEY: Record<string, string> = {
  'Television': 'television', 'Radio': 'radio', 'Newspaper': 'newspaper', 'Magazines': 'magazines',
  'OOH': 'ooh', 'Cinema': 'cinema', 'Digital Display': 'digiDisplay', 'Digital Audio': 'digiAudio',
  'Digital Video': 'digiVideo', 'BVOD': 'bvod', 'Search': 'search', 'Social Media': 'socialMedia',
  'Programmatic Display': 'progDisplay', 'Programmatic Video': 'progVideo', 'Programmatic BVOD': 'progBvod',
  'Programmatic Audio': 'progAudio', 'Programmatic OOH': 'progOoh',
  'Integration': 'integration', 'Influencers': 'influencers',
  'Production': 'production',
};

export type GenerateMediaPlanOptions = {
  /** 'aa' omits Service Fee and Adserving/Tech rows (caller supplies adjusted totals_ex_gst / total_inc_gst). */
  mbaTotalsLayout?: 'standard' | 'aa'
}

export async function generateMediaPlan(
  header: MediaPlanHeader,
  mediaItems: MediaItems,
  mbaData?: {
    gross_media: { media_type: string; gross_amount: number }[];
    totals: {
      gross_media: number;
      service_fee: number;
      production: number;
      adserving: number;
      totals_ex_gst: number;
      total_inc_gst: number;
    };
  },
  options?: GenerateMediaPlanOptions
): Promise<ExcelJS.Workbook> {
  const mbaTotalsLayout = options?.mbaTotalsLayout ?? 'standard'
  const {
    logoBase64,
    client,
    brand,
    campaignName,
    mbaNumber,
    clientContact,
    planVersion,
    poNumber,
    campaignBudget,
    campaignStatus,
    campaignStart, // dd/MM/yyyy
    campaignEnd,   // dd/MM/yyyy
  } = header;

  // Keys for grouping line items for each media type
  const groupingKeysConfig: Record<string, (keyof LineItem)[]> = {
    "Television": ['market', 'network', 'station', 'daypart', 'placement', 'size', 'buyingDemo', 'buyType'],
    "Newspapers": ['market', 'network', 'title', 'placement', 'size', 'buyingDemo', 'buyType'],
    "Magazines": ['market', 'network', 'title', 'placement', 'size', 'buyingDemo', 'buyType'],
    "Search": ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType', 'line_item_id', 'lineItemId'],
    "Social Media": ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Programmatic Display": ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Programmatic BVOD": ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Programmatic Video": ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Programmatic Audio": ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Programmatic OOH": ['market', 'platform', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Radio": ['market', 'network', 'station', 'placement', 'size', 'radioDuration', 'buyingDemo', 'buyType'],
    "Cinema": ['market', 'network', 'station', 'placement', 'size', 'buyingDemo', 'buyType'],
    "OOH": ['market', 'network', 'oohFormat', 'oohType', 'placement', 'size', 'buyingDemo', 'buyType'],
    "BVOD": ['market', 'platform', 'site', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Digital Display": ['market', 'platform', 'site', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Digital Audio": ['market', 'platform', 'site', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Digital Video": ['market', 'platform', 'site', 'bidStrategy', 'targeting', 'creative', 'buyingDemo', 'buyType'],
    "Integration": ['platform', 'objective', 'campaign', 'targeting', 'buyType', 'line_item_id', 'lineItemId'],
    "Influencers": ['platform', 'objective', 'campaign', 'targeting', 'buyType', 'line_item_id', 'lineItemId'],
    "Production": ['market', 'platform', 'network', 'creative', 'buyType'],
    // ... (other configs)
  };

    // Configuration for table columns for each media type
  // ... (ensure your tableConfigs are complete and correct for all media types you use)


  function groupLineItems(itemsToGroup: LineItem[], mediaTypeTitle: string): GroupedItem[] {
    const groupedResult: GroupedItem[] = [];
    if (!itemsToGroup || itemsToGroup.length === 0) {
      return groupedResult;
    }

    // Always include a unique identifier when present so duplicated line items are not merged away
    const idKeys: (keyof LineItem)[] = ['line_item_id', 'lineItemId', 'line_item', 'lineItem'];
    const baseKeys = groupingKeysConfig[mediaTypeTitle] || (itemsToGroup[0] ? Object.keys(itemsToGroup[0]) as (keyof LineItem)[] : []);
    const keysForGrouping: (keyof LineItem)[] = [...baseKeys];

    idKeys.forEach(k => {
      if (!keysForGrouping.includes(k) && itemsToGroup.some(item => (item as any)[k])) {
        keysForGrouping.push(k);
      }
    });

    itemsToGroup.forEach(item => {
      const key = keysForGrouping.map(k => (item as any)[k] ?? '').join('|');
      let group = groupedResult.find(g => g.groupKey === key);

      const itemStartDate = item.startDate; // YYYY-MM-DD
      const itemEndDate = item.endDate;   // YYYY-MM-DD
      const deliverablesAmtNum = parseFloat(String(item.deliverablesAmount).replace(/[^0-9.-]+/g,"")) || 0;
      let grossMediaNum = parseFloat(String(item.grossMedia).replace(/[^0-9.-]+/g,"")) || 0;
      // For clientPaysForMedia items, grossMedia is set to 0 by containers.
      // The Excel media plan should always show the full media value, so fall back to deliverablesAmount.
      if (grossMediaNum === 0 && lineItemIsClientPaysForMedia(item)) {
        grossMediaNum = parseFloat(String(item.deliverablesAmount).replace(/[^0-9.-]+/g,"")) || 0;
      }
      const calculatedDeliverablesNum = parseFloat(String(item.deliverables).replace(/[^0-9.-]+/g,"")) || 0;

      if (!group) {
        group = {
          market: item.market, platform: item.platform, network: item.network, station: item.station,
          bidStrategy: item.bidStrategy, targeting: item.targeting, creative: item.creative,
          buyingDemo: item.buyingDemo, buyType: item.buyType, daypart: item.daypart,
          placement: item.placement, size: item.size, format: item.format, duration: item.duration,
          oohFormat: item.oohFormat, oohType: item.oohType,
          panels: item.panels, cinemaTarget: item.cinemaTarget, screens: item.screens, title: item.title,
          insertions: item.insertions, radioDuration: item.radioDuration, spots: item.spots,
          site: item.site, digitalDuration: item.digitalDuration,
          deliverablesAmount: 0,
          grossMedia: 0,
          totalCalculatedDeliverables: 0,
          bursts: [],
          groupStartDate: itemStartDate,
          groupEndDate: itemEndDate,
          groupKey: key,
        };
        groupedResult.push(group);
      }

      if (group) { // group will always be defined here due to the !group block
        group.bursts.push({
            startDate: itemStartDate,
            endDate: itemEndDate,
            deliverablesAmount: deliverablesAmtNum,
            deliverables: calculatedDeliverablesNum,
        });
        group.deliverablesAmount += deliverablesAmtNum; // This is sum of burst budgets
        group.grossMedia += grossMediaNum;
        group.totalCalculatedDeliverables += calculatedDeliverablesNum;

        if (parseDateStringYYYYMMDD(itemStartDate) < parseDateStringYYYYMMDD(group.groupStartDate)) {
            group.groupStartDate = itemStartDate;
        }
        if (parseDateStringYYYYMMDD(itemEndDate) > parseDateStringYYYYMMDD(group.groupEndDate)) {
            group.groupEndDate = itemEndDate;
        }
      }
    });
    return groupedResult;
  }

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Media Plan');
  sheet.views = [{ state: 'normal', showGridLines: false, zoomScale: 60 }];
  sheet.mergeCells('B2:C2');

  const pxToChars = (px: number) => px / 7; // Approximate conversion
  const widths = [78, 189, 268, 238, 488, 357, 175, 175, 175, 175, 213, 175, 214, 214]; // Up to Column N
  widths.forEach((px, i) => {
    if (i + 1 <= sheet.columns.length) { // Check if column exists
        sheet.getColumn(i + 1).width = pxToChars(px);
    } else {

        const col = sheet.getColumn(i + 1); // This might create it
        col.width = pxToChars(px);
    }
  });
  sheet.getRow(2).height = 57;

  if (logoBase64) {
    const logoId = workbook.addImage({ base64: logoBase64, extension: 'png' });
    const logoWidthPx = 457;
    const logoHeightPx = 71;
    sheet.addImage(logoId, {
      tl: { col: 1, row: 1 }, // B2 (0-indexed for lib, 1-based for Excel UI)
      ext: { width: logoWidthPx, height: logoHeightPx }
    });
  }

  const style = (
    cellOrRef: string | ExcelJS.Cell,
    options: Partial<{ value: any; fontSize: number; bold: boolean; align: 'left' | 'right' | 'center'; verticalAlign: 'top' | 'middle' | 'bottom'; fill: ExcelJS.Fill; numFmt: string; fontColor: string, textRotation: number | 'vertical', border: Partial<ExcelJS.Borders> }>
  ) => {
    const c = typeof cellOrRef === 'string' ? sheet.getCell(cellOrRef) : cellOrRef;
    if (options.value !== undefined) c.value = options.value;
    c.font = { name: 'Aptos', size: options.fontSize ?? 15, bold: options.bold ?? false, color: options.fontColor ? { argb: options.fontColor } : undefined };
    c.alignment = { horizontal: options.align ?? 'left', vertical: options.verticalAlign ?? 'middle', wrapText: false, textRotation: options.textRotation as any }; // wrapText false by default
    if (options.fill) c.fill = options.fill;
    if (options.numFmt) c.numFmt = options.numFmt;
  };

  style('D2', { value: 'Media Plan', fontSize: 30, bold: true, align: 'left', verticalAlign: 'middle' });

  const headerFontSize = 15;
  const greyFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  // Left column
  style('B3', { value: 'Client', bold: true, align: 'right', fontSize: headerFontSize }); style('C3', { value: client, align: 'left', fontSize: headerFontSize, fill: greyFill });
  style('B4', { value: 'Brand', bold: true, align: 'right', fontSize: headerFontSize }); style('C4', { value: brand, align: 'left', fontSize: headerFontSize, fill: greyFill });
  style('B5', { value: 'Campaign', bold: true, align: 'right', fontSize: headerFontSize }); style('C5', { value: campaignName, align: 'left', fontSize: headerFontSize, fill: greyFill });
  style('B6', { value: 'MBA Number', bold: true, align: 'right', fontSize: headerFontSize }); style('C6', { value: mbaNumber, align: 'left', fontSize: headerFontSize, fill: greyFill });
  // Middle column
  style('D3', { value: 'Client Contact', bold: true, align: 'right', fontSize: headerFontSize }); style('E3', { value: clientContact, align: 'left', fontSize: headerFontSize, fill: greyFill });
  style('D4', { value: 'Plan Version', bold: true, align: 'right', fontSize: headerFontSize }); style('E4', { value: planVersion, align: 'left', fontSize: headerFontSize, fill: greyFill });
  style('D5', { value: 'Plan Date', bold: true, align: 'right', fontSize: headerFontSize }); style('E5', { value: (new Date()).toLocaleDateString('en-AU', {timeZone: 'UTC'}), align: 'left', fontSize: headerFontSize, fill: greyFill, numFmt: 'dd/mm/yyyy' });
  style('D6', { value: 'PO Number', bold: true, align: 'right', fontSize: headerFontSize }); style('E6', { value: poNumber, align: 'left', fontSize: headerFontSize, fill: greyFill });
  // Right column
  style('F3', { value: 'Campaign Budget', bold: true, align: 'right', fontSize: headerFontSize }); style('G3', { value: parseFloat(campaignBudget.replace(/[^0-9.-]+/g,"")) || 0, align: 'left', fontSize: headerFontSize, fill: greyFill, numFmt: '$#,##0.00' });
  style('F4', { value: 'Campaign Status', bold: true, align: 'right', fontSize: headerFontSize }); style('G4', { value: campaignStatus, align: 'left', fontSize: headerFontSize, fill: greyFill });
  style('F5', { value: 'Campaign Start Date', bold: true, align: 'right', fontSize: headerFontSize }); style('G5', { value: parseDateStringDDMMYYYY(campaignStart), align: 'left', fontSize: headerFontSize, fill: greyFill, numFmt: 'dd/mm/yyyy' });
  style('F6', { value: 'Campaign End Date', bold: true, align: 'right', fontSize: headerFontSize }); style('G6', { value: parseDateStringDDMMYYYY(campaignEnd), align: 'left', fontSize: headerFontSize, fill: greyFill, numFmt: 'dd/mm/yyyy' });

  const parsedCampaignStartDate = parseDateStringDDMMYYYY(campaignStart);
  const parsedCampaignEndDate = parseDateStringDDMMYYYY(campaignEnd);

  const firstSunday = new Date(parsedCampaignStartDate); // Will be UTC
  firstSunday.setUTCDate(parsedCampaignStartDate.getUTCDate() - parsedCampaignStartDate.getUTCDay());

  const lastSunday = new Date(parsedCampaignEndDate); // Will be UTC
  if (parsedCampaignEndDate.getUTCDay() !== 0) {
    lastSunday.setUTCDate(parsedCampaignEndDate.getUTCDate() + (7 - parsedCampaignEndDate.getUTCDay()));
  }

  const msPerDay = 1000 * 60 * 60 * 24;
  const lightDashedBorder: Partial<ExcelJS.Borders> = {
   top: { style: 'dashed', color: { argb: 'FFBFBFBF' } }, left: { style: 'dashed', color: { argb: 'FFBFBFBF' } },
   bottom: { style: 'dashed', color: { argb: 'FFBFBFBF' } }, right: { style: 'dashed', color: { argb: 'FFBFBFBF' } }
  };

  const blackBorder: Partial<ExcelJS.Borders> = {
    top: { style: 'thin', color: { argb: 'FF000000' } }, 
    left: { style: 'thin', color: { argb: 'FF000000' } },
    bottom: { style: 'thin', color: { argb: 'FF000000' } }, 
    right: { style: 'thin', color: { argb: 'FF000000' } }
  };

  const firstDateCol = 15; // Column O
  // Calculate lastDateCol based on the timeline
  const timelineDays = Math.floor((lastSunday.getTime() - firstSunday.getTime()) / msPerDay);
  const lastDateCol = firstDateCol + timelineDays;

  // Track merged gantt ranges per row to avoid double-merging when line items repeat
  const mergedGanttRanges = new Map<number, { start: number; end: number }[]>();
  const ganttFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD02A60' } };

  function mergeBurstCells(
    itemRow: number,
    ganttStart: number,
    ganttEnd: number,
    deliverables: number | string,
    errorContext: string
  ) {
    const existingRanges = mergedGanttRanges.get(itemRow) ?? [];
    const overlap = existingRanges.find(r => ganttStart <= r.end && ganttEnd >= r.start);

    // Consolidate overlapping/duplicate bursts into the same merged cell
    if (overlap) {
      const targetCell = sheet.getCell(itemRow, overlap.start);
      const currentVal = typeof targetCell.value === 'number'
        ? targetCell.value
        : parseFloat(String(targetCell.value).replace(/[^0-9.-]+/g, '')) || 0;
      const incomingVal = typeof deliverables === 'number'
        ? deliverables
        : parseFloat(String(deliverables).replace(/[^0-9.-]+/g, '')) || 0;

      style(targetCell, {
        value: currentVal + incomingVal,
        fontSize: 15,
        align: 'center',
        verticalAlign: 'middle',
        fill: ganttFill,
        fontColor: 'FFFFFFFF',
        numFmt: '#,##0'
      });
      targetCell.border = lightDashedBorder;
      return;
    }

    try {
      sheet.mergeCells(itemRow, ganttStart, itemRow, ganttEnd);
      const cell = sheet.getCell(itemRow, ganttStart);
      style(cell, {
        value: deliverables,
        fontSize: 15,
        align: 'center',
        verticalAlign: 'middle',
        fill: ganttFill,
        fontColor: 'FFFFFFFF',
        numFmt: '#,##0'
      });
      cell.border = lightDashedBorder;

      existingRanges.push({ start: ganttStart, end: ganttEnd });
      mergedGanttRanges.set(itemRow, existingRanges);
    } catch (e) {
      console.error(`Error drawing ${errorContext} burst Gantt:`, e);
    }
  }


  for (
    let d = new Date(firstSunday.getTime()), colIdx = firstDateCol; // Use getTime() to clone
    d.getTime() <= lastSunday.getTime(); // Compare getTime() for safety with UTC dates
    d.setUTCDate(d.getUTCDate() + 1), colIdx++
  ) {
    if (colIdx > sheet.columns.length) { // Dynamically set width if column is new
        sheet.getColumn(colIdx).width = 3.5;
    }

    const dateCell = sheet.getCell(7, colIdx);
    style(dateCell, {
        value: new Date(d.getTime()), // Store as Date object (already UTC)
        numFmt: 'dd/mm/yyyy', align: 'center', verticalAlign: 'bottom', textRotation: 45, fontSize: 10
    });
    dateCell.border = lightDashedBorder; // Added border to date row

    const dayCell = sheet.getCell(8, colIdx);
    const days = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    style(dayCell, {
        value: days[d.getUTCDay()], // Use getUTCDay for UTC dates
        align: 'center', verticalAlign: 'top', textRotation: 0, fontSize: 6
    });
    dayCell.border = lightDashedBorder;
  }

  // Build month-to-column mapping for date columns (partial months merge)
  type MonthRange = { monthYear: string; startCol: number; endCol: number };
  const monthRanges: MonthRange[] = [];
  let currentMonth = '';
  let rangeStart = firstDateCol;
  for (
    let d = new Date(firstSunday.getTime()), col = firstDateCol;
    d.getTime() <= lastSunday.getTime();
    d.setUTCDate(d.getUTCDate() + 1), col++
  ) {
    const monthYear = d.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    if (monthYear !== currentMonth && currentMonth) {
      monthRanges.push({ monthYear: currentMonth, startCol: rangeStart, endCol: col - 1 });
      rangeStart = col;
    }
    currentMonth = monthYear;
  }
  if (currentMonth) {
    monthRanges.push({ monthYear: currentMonth, startCol: rangeStart, endCol: lastDateCol });
  }

  // Calculate monthly media by channel from line items (same logic as billing/delivery schedule)
  type MediaKey = 'search' | 'socialMedia' | 'television' | 'radio' | 'newspaper' | 'magazines' | 'ooh' | 'cinema' | 'digiDisplay' | 'digiAudio' | 'digiVideo' | 'bvod' | 'integration' | 'influencers' | 'progDisplay' | 'progVideo' | 'progBvod' | 'progAudio' | 'progOoh' | 'production';
  const MEDIA_ITEMS_KEYS: { key: keyof MediaItems; mediaKey: MediaKey }[] = [
    { key: 'television', mediaKey: 'television' }, { key: 'radio', mediaKey: 'radio' },
    { key: 'newspaper', mediaKey: 'newspaper' }, { key: 'magazines', mediaKey: 'magazines' },
    { key: 'ooh', mediaKey: 'ooh' }, { key: 'cinema', mediaKey: 'cinema' },
    { key: 'digiDisplay', mediaKey: 'digiDisplay' }, { key: 'digiAudio', mediaKey: 'digiAudio' },
    { key: 'digiVideo', mediaKey: 'digiVideo' }, { key: 'bvod', mediaKey: 'bvod' },
    { key: 'search', mediaKey: 'search' }, { key: 'socialMedia', mediaKey: 'socialMedia' },
    { key: 'progDisplay', mediaKey: 'progDisplay' }, { key: 'progVideo', mediaKey: 'progVideo' },
    { key: 'progBvod', mediaKey: 'progBvod' }, { key: 'progAudio', mediaKey: 'progAudio' },
    { key: 'progOoh', mediaKey: 'progOoh' }, { key: 'integration', mediaKey: 'integration' },
    { key: 'influencers', mediaKey: 'influencers' },
    { key: 'production', mediaKey: 'production' },
  ];

  const monthlyByChannel: Record<string, Record<string, number>> = {};
  function distributeBurstToMonths(
    startDate: string,
    endDate: string,
    mediaAmount: number,
    mediaKey: MediaKey
  ) {
    const s = parseDateStringYYYYMMDD(startDate);
    const e = parseDateStringYYYYMMDD(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || s > e) return;
    const daysTotal = Math.ceil((e.getTime() - s.getTime()) / msPerDay) + 1;
    if (daysTotal <= 0) return;

    let d = new Date(s.getTime());
    while (d <= e) {
      const monthYear = d.toLocaleString('en-AU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const monthStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
      const monthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
      const sliceStart = Math.max(s.getTime(), monthStart.getTime());
      const sliceEnd = Math.min(e.getTime(), monthEnd.getTime());
      const daysInMonth = Math.ceil((sliceEnd - sliceStart) / msPerDay) + 1;
      const ratio = daysInMonth / daysTotal;
      const share = mediaAmount * ratio;

      if (!monthlyByChannel[mediaKey]) monthlyByChannel[mediaKey] = {};
      monthlyByChannel[mediaKey][monthYear] = (monthlyByChannel[mediaKey][monthYear] || 0) + share;

      d.setUTCMonth(d.getUTCMonth() + 1);
      d.setUTCDate(1);
    }
  }

  for (const { key, mediaKey } of MEDIA_ITEMS_KEYS) {
    const items = mediaItems[key] || [];
    for (const item of items) {
      let amt = parseFloat(String(item.grossMedia).replace(/[^0-9.-]+/g, '')) || 0;
      // For clientPaysForMedia items, grossMedia is 0 but deliverablesAmount has the real budget
      if (amt === 0 && lineItemIsClientPaysForMedia(item)) {
        amt = parseFloat(String(item.deliverablesAmount).replace(/[^0-9.-]+/g, '')) || 0;
      }
      if (amt > 0 && item.startDate && item.endDate) {
        distributeBurstToMonths(item.startDate, item.endDate, amt, mediaKey);
      }
    }
  }

  // Standard headers for data section (B-N)
  const BIDDABLE_DATA_HEADERS = [
      'Market', 'Platform', 'Bid Strategy', 'Targeting', 'Creative', 'Start Date', 'End Date',
      '', 'Deliverables', 'Buying Demo', 'Buy Type', 'Avg. Rate', 'Gross Media'
  ];

  const BIDDABLE_WITH_SITE_HEADERS = [
      'Market', 'Platform', 'Site', 'Targeting', 'Creative', 'Start Date', 'End Date',
      '', 'Deliverables', 'Buying Demo', 'Buy Type', 'Avg. Rate', 'Gross Media'
  ];

  const TV_DATA_HEADERS = [
    'Market', 'Network', 'Station', 'Daypart', 'Placement', 'Start Date', 'End Date', 'Length', 'Deliverables', 'Buying Demo', 'Buy Type', 'Avg. Rate', 'Gross Media'
  ];

  const PRESS_DATA_HEADERS = [
    'Market', 'Network', 'Title', 'Placement', '', 'Start Date', 'End Date', 'Ad Size', 'Deliverables', 'Buying Demo', 'Buy Type', 'Avg. Rate', 'Gross Media'
  ];

  const RADIO_DATA_HEADERS = [
    'Market', 'Network', 'Station', 'Placement', 'Format', 'Start Date', 'End Date', 'Duration', 'Deliverables', 'Buying Demo', 'Buy Type', 'Avg. Rate', 'Gross Media'
  ];

  const CINEMA_DATA_HEADERS = [
    'Market', 'Network', 'Station', 'Placement', 'Format', 'Start Date', 'End Date', 'Duration', 'Deliverables', 'Buying Demo', 'Buy Type', 'Avg. Rate', 'Gross Media'
  ];

  const OOH_DATA_HEADERS = [
    'Market', 'Network', 'Format', 'Placement', 'Type', 'Start Date', 'End Date', 'Size', 'Deliverables', 'Buying Demo', 'Buy Type', 'Avg. Rate', 'Gross Media'
  ];

  // B Market, C Publisher, D blank, E Description, F blank,
  // G Start Date, H End Date, I blank, J Amount, K/L/M blanks, N Media
  const PRODUCTION_HEADERS = [
    'Market', 'Publisher', '', 'Description', '', 'Start Date', 'End Date', '', 'Amount', '', '', '', 'Media'
  ];

  function drawSection(
    title: string,
    items: GroupedItem[],
    startRow: number,
    sectionType: 'Biddable' | 'Television' | 'Press' | 'Radio' | 'Cinema' | 'OOH' | 'Production'
  ): number {
    let r = startRow;
    const sectionHasItems = items.length > 0;
  
    // Determine which headers to use based on section type and title
    const useSiteHeader = ['BVOD', 'Digital Display', 'Digital Audio', 'Digital Video'].includes(title);
    const biddableHeaders = useSiteHeader ? BIDDABLE_WITH_SITE_HEADERS : BIDDABLE_DATA_HEADERS;
  
    // This logic correctly selects the headers to use
    const headersToUse =
      sectionType === 'Television' ? TV_DATA_HEADERS :
      sectionType === 'Press' ? PRESS_DATA_HEADERS :
      sectionType === 'Radio' ? RADIO_DATA_HEADERS :
      sectionType === 'Cinema' ? CINEMA_DATA_HEADERS :
      sectionType === 'OOH' ? OOH_DATA_HEADERS :
      sectionType === 'Production' ? PRODUCTION_HEADERS :
      biddableHeaders;
  
    // --- Section Title & Header Rendering ---
    const headerLastColNum = Math.max(14, lastDateCol);
    sheet.mergeCells(r, 2, r, headerLastColNum);
    style(sheet.getCell(r, 2), {
      value: title,
      fontSize: 14,
      bold: true,
      align: 'left',
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } },
      fontColor: 'FFFFFFFF'
    });
    r++;

    // Grey header row (Buy Type, Avg Rate, Gross Media, etc.) - month names in date columns on SAME row
    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF808080' } };
    headersToUse.forEach((h, i) => {
      style(sheet.getCell(r, 2 + i), {
        value: h, bold: true, align: 'left', fill: headerFill, fontColor: 'FFFFFFFF', fontSize: 14
      });
    });
    for (const { monthYear, startCol, endCol } of monthRanges) {
      if (startCol < endCol) {
        try {
          sheet.mergeCells(r, startCol, r, endCol);
        } catch {
          // Cell may already be part of a merge
        }
      }
      const cell = sheet.getCell(r, startCol);
      style(cell, {
        value: monthYear,
        fontSize: 14,
        align: 'center',
        verticalAlign: 'middle',
        fill: headerFill,
        fontColor: 'FFFFFFFF'
      });
      cell.border = lightDashedBorder;
    }
    r++;

    // Blank row with borders on date columns
    for (let cIdx = firstDateCol; cIdx <= lastDateCol; cIdx++) {
      sheet.getCell(r, cIdx).border = lightDashedBorder;
    }
    r++;

    const dataSectionStartRow = r;
  
    // --- Data Row Rendering ---
    if (sectionHasItems) {
      items.forEach(it => {
        // FIX: Declared dataRowValues with `let` to be populated in the if/else blocks.
        let dataRowValues: any[];
        let averageRate = 0;
  
        // FIX: Correctly structured if/else if/else chain.
        if (sectionType === 'Production') {
          dataRowValues = [
            it.market,
            it.network || it.platform || '',
            '',
            it.creative || '',
            '',
            it.groupStartDate ? parseDateStringYYYYMMDD(it.groupStartDate) : null,
            it.groupEndDate ? parseDateStringYYYYMMDD(it.groupEndDate) : null,
            '',
            it.totalCalculatedDeliverables,
            '', '', '',
            it.grossMedia,
          ];
        } else if (sectionType === 'Television') {
          if (it.totalCalculatedDeliverables && it.totalCalculatedDeliverables !== 0) {
            averageRate = it.grossMedia / it.totalCalculatedDeliverables; // CPP
          }
          dataRowValues = [
            it.market,
            it.network || '',
            it.station || '',
            it.daypart || '',
            it.placement || '',
            it.groupStartDate ? parseDateStringYYYYMMDD(it.groupStartDate) : null,
            it.groupEndDate ? parseDateStringYYYYMMDD(it.groupEndDate) : null,
            it.size || '', // Length column
            it.totalCalculatedDeliverables, // TARPs
            it.buyingDemo || '',
            formatBuyType(it.buyType),
            averageRate, // Avg. CPP
            it.grossMedia
          ];
        } else if (sectionType === 'Press') {
          if (it.totalCalculatedDeliverables && it.totalCalculatedDeliverables !== 0) {
            averageRate = it.grossMedia / it.totalCalculatedDeliverables; // Cost Per Insertion
          }
          dataRowValues = [
            it.market,
            it.network || '',
            it.title || '',
            it.placement || '', // Placement column
            '', // Blank column
            it.groupStartDate ? parseDateStringYYYYMMDD(it.groupStartDate) : null,
            it.groupEndDate ? parseDateStringYYYYMMDD(it.groupEndDate) : null,
            it.size || '', // Ad Size column
            it.totalCalculatedDeliverables, // Insertions
            it.buyingDemo || '',
            formatBuyType(it.buyType),
            averageRate,
            it.grossMedia
          ];
        } else if (sectionType === 'Radio') {
          if (it.totalCalculatedDeliverables && it.totalCalculatedDeliverables !== 0) {
            averageRate = it.grossMedia / it.totalCalculatedDeliverables; // Cost Per Spot
          }
          dataRowValues = [
            it.market,
            it.network || '',
            it.station || '',
            it.placement || '',
            it.creative || it.format || '', // Format column - RadioContainer maps format to creative
            it.groupStartDate ? parseDateStringYYYYMMDD(it.groupStartDate) : null,
            it.groupEndDate ? parseDateStringYYYYMMDD(it.groupEndDate) : null,
            it.radioDuration || it.duration || '', // Duration column
            it.totalCalculatedDeliverables, // Spots
            it.buyingDemo || '',
            formatBuyType(it.buyType),
            averageRate,
            it.grossMedia
          ];
        } else if (sectionType === 'Cinema') {
          if (it.totalCalculatedDeliverables && it.totalCalculatedDeliverables !== 0) {
            // Cost Per Screen - fixed calculation (was 10 times less than it should be)
            averageRate = (it.grossMedia / it.totalCalculatedDeliverables) * 1000; // Cost Per Screen
          }
          dataRowValues = [
            it.market,
            it.network || '',
            it.station || '',
            it.placement || '',
            it.format || it.creative || '', // Format column
            it.groupStartDate ? parseDateStringYYYYMMDD(it.groupStartDate) : null,
            it.groupEndDate ? parseDateStringYYYYMMDD(it.groupEndDate) : null,
            it.duration || it.radioDuration || '', // Duration column
            it.totalCalculatedDeliverables, // Screens
            it.buyingDemo || '',
            formatBuyType(it.buyType),
            averageRate,
            it.grossMedia
          ];
        } else if (sectionType === 'OOH') {
          if (it.totalCalculatedDeliverables && it.totalCalculatedDeliverables !== 0) {
            averageRate = it.grossMedia / it.totalCalculatedDeliverables; // Cost Per Panel
          }
          dataRowValues = [
            it.market,
            it.network || '',
            it.oohFormat || '',
            it.placement || '',
            it.oohType || '',
            it.groupStartDate ? parseDateStringYYYYMMDD(it.groupStartDate) : null,
            it.groupEndDate ? parseDateStringYYYYMMDD(it.groupEndDate) : null,
            it.size || '', // Size column
            it.totalCalculatedDeliverables, // Panels
            it.buyingDemo || '',
            formatBuyType(it.buyType),
            averageRate,
            it.grossMedia
          ];
        } else { // 'Biddable'
          const buyTypeLower = it.buyType?.toLowerCase() || '';
          if (it.totalCalculatedDeliverables && it.totalCalculatedDeliverables !== 0) {
              if (buyTypeLower === 'cpm') {
                  averageRate = (it.grossMedia / it.totalCalculatedDeliverables) * 1000;
              } else {
                  averageRate = it.grossMedia / it.totalCalculatedDeliverables;
              }
          }
          // Use site field for BVOD, Digital Display, Digital Audio, Digital Video
          const useSite = ['BVOD', 'Digital Display', 'Digital Audio', 'Digital Video'].includes(title);
          const thirdColumnValue = useSite ? (it.site || '') : formatBidStrategy(it.bidStrategy);
          
          dataRowValues = [
            it.market || '',
            it.platform || '',
            thirdColumnValue,
            it.targeting || '',
            it.creative || '',
            it.groupStartDate ? parseDateStringYYYYMMDD(it.groupStartDate) : null,
            it.groupEndDate ? parseDateStringYYYYMMDD(it.groupEndDate) : null,
            it.size || '', // Length column
            it.totalCalculatedDeliverables,
            it.buyingDemo || '',
            formatBuyType(it.buyType),
            averageRate,
            it.grossMedia
          ];
        }
  
        // FIX: This loop is now OUTSIDE the if/else chain, so it runs for ALL section types.
        dataRowValues.forEach((val, i) => {
          const cell = sheet.getCell(r, 2 + i);
          const cellStyleOptions: Partial<Parameters<typeof style>[1]> = { value: val, fontSize: 15, verticalAlign: 'middle' };

          if (i === 5 || i === 6) { // Start/End Date
             cellStyleOptions.numFmt = 'dd/mm/yyyy'; cellStyleOptions.align = 'center';
          } else if (sectionType === 'Television' && i === 8) { // TARPs
             cellStyleOptions.numFmt = '#,##0'; cellStyleOptions.align = 'right';
          } else if (i === 8) { // Default Deliverables
             cellStyleOptions.numFmt = '#,##0'; cellStyleOptions.align = 'right';
          } else if (i === 11) { // Avg Rate - keep higher precision for rates
             cellStyleOptions.numFmt = '$#,##0.00##'; cellStyleOptions.align = 'right';
          } else if (i === 12) { // Gross Media - 2 decimals for budgets/media
             cellStyleOptions.numFmt = '$#,##0.00'; cellStyleOptions.align = 'right';
          } else if ((sectionType === 'Television' || sectionType === 'Radio' || sectionType === 'Cinema') && i === 7) { // Length/Duration column
              cellStyleOptions.align = 'center';
          } else if (sectionType === 'Press' && i === 7) { // Ad Size column
              cellStyleOptions.align = 'center';
          } else if (sectionType === 'OOH' && i === 7) { // Size column
              cellStyleOptions.align = 'center';
          } else {
             cellStyleOptions.align = 'left';
          }
          style(cell, cellStyleOptions);
        });

        for (let cIdx = firstDateCol; cIdx <= lastDateCol; cIdx++) {
          sheet.getCell(r, cIdx).border = lightDashedBorder;
        }
        r++;
      });
    } else {
      // This logic for empty sections remains correct.
      for (let cIdx = firstDateCol; cIdx <= lastDateCol; cIdx++) {
        sheet.getCell(r, cIdx).border = lightDashedBorder;
      }
      r++;
    }
  
    // --- Blank Row Before Total & Total Row Rendering (No changes needed) ---
    for (let cIdx = firstDateCol; cIdx <= lastDateCol; cIdx++) {
      sheet.getCell(r, cIdx).border = lightDashedBorder;
    }
    r++;
  
    const totalFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDDC52' } };
    for (let colNum = 2; colNum <= headerLastColNum; colNum++) {
        style(sheet.getCell(r, colNum), { fill: totalFill });
    }
    sheet.mergeCells(r, 2, r, 12);
    style(sheet.getCell(r, 2), {
      value: `Total ${title}`, bold: true, align: 'right', fill: totalFill, fontColor: 'FF000000'
    });

    const sumGrossMedia = items.reduce((s, x) => s + x.grossMedia, 0);
    style(sheet.getCell(r, 14), {
      value: sumGrossMedia, bold: true, align: 'right', numFmt: '$#,##0.00', fill: totalFill, fontColor: 'FF000000'
    });

    // Monthly costs in date columns (calculated from line items - same as page)
    const mediaKey = SECTION_TO_MEDIA_KEY[title] as MediaKey | undefined;
    if (mediaKey && monthlyByChannel[mediaKey]) {
      for (const { monthYear, startCol, endCol } of monthRanges) {
        const amount = monthlyByChannel[mediaKey][monthYear] ?? 0;
        if (startCol < endCol) {
          try {
            sheet.mergeCells(r, startCol, r, endCol);
          } catch {
            // Cell may already be part of a merge
          }
        }
        const cell = sheet.getCell(r, startCol);
        style(cell, {
          value: amount,
          fontSize: 14,
          bold: true,
          align: 'center',
          verticalAlign: 'middle',
          fill: totalFill,
          fontColor: 'FF000000',
          numFmt: '$#,##0.00'
        });
        cell.border = lightDashedBorder;
      }
    }

    // Add exterior border around the entire section
    const sectionStartRow = startRow;
    const sectionEndRow = r;
    const sectionStartCol = 2;
    const sectionEndCol = headerLastColNum;
    
    // Top border
    for (let cIdx = sectionStartCol; cIdx <= sectionEndCol; cIdx++) {
      sheet.getCell(sectionStartRow, cIdx).border = { ...sheet.getCell(sectionStartRow, cIdx).border, top: { style: 'thin', color: { argb: 'FF000000' } } };
    }
    
    // Bottom border
    for (let cIdx = sectionStartCol; cIdx <= sectionEndCol; cIdx++) {
      sheet.getCell(sectionEndRow, cIdx).border = { ...sheet.getCell(sectionEndRow, cIdx).border, bottom: { style: 'thin', color: { argb: 'FF000000' } } };
    }
    
    // Left border
    for (let rIdx = sectionStartRow; rIdx <= sectionEndRow; rIdx++) {
      sheet.getCell(rIdx, sectionStartCol).border = { ...sheet.getCell(rIdx, sectionStartCol).border, left: { style: 'thin', color: { argb: 'FF000000' } } };
    }
    
    // Right border
    for (let rIdx = sectionStartRow; rIdx <= sectionEndRow; rIdx++) {
      sheet.getCell(rIdx, sectionEndCol).border = { ...sheet.getCell(rIdx, sectionEndCol).border, right: { style: 'thin', color: { argb: 'FF000000' } } };
    }
  
    return dataSectionStartRow;
  }

  let currentRow = 9;

  // --- Television ---
  const groupedTelevisionRaw = mediaItems.television || []; // Get raw items for Television
  const groupedTelevision: GroupedItem[] = groupLineItems(groupedTelevisionRaw, "Television"); // Group them

  if (groupedTelevision.length > 0) { // Only proceed if there are search items to display
      const televisionDataStartActualRow = drawSection('Television', groupedTelevision, currentRow, 'Television'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedTelevision.forEach((it, idx) => {
        const itemRow = televisionDataStartActualRow + idx; // Data rows start at televisionDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'television');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });


      currentRow += (groupedTelevision.length + 5);
  }

  // --- Radio ---
  const groupedRadioRaw = mediaItems.radio || []; // Get raw items for Radio
  const groupedRadio: GroupedItem[] = groupLineItems(groupedRadioRaw, "Radio"); // Group them

  if (groupedRadio.length > 0) { // Only proceed if there are radio items to display
      const radioDataStartActualRow = drawSection('Radio', groupedRadio, currentRow, 'Radio'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedRadio.forEach((it, idx) => {
        const itemRow = radioDataStartActualRow + idx; // Data rows start at radioDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'radio');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Radio burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedRadio.length + 5);
  }

  // --- Newspaper ---
  const groupedNewspaperRaw = mediaItems.newspaper || []; // Get raw items for Newspaper
  const groupedNewspaper: GroupedItem[] = groupLineItems(groupedNewspaperRaw, "Newspapers"); // Group them

  if (groupedNewspaper.length > 0) { // Only proceed if there are search items to display
      const newspaperDataStartActualRow = drawSection('Newspaper', groupedNewspaper, currentRow, 'Press'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedNewspaper.forEach((it, idx) => {
        const itemRow = newspaperDataStartActualRow + idx; // Data rows start at newspaperDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'newspaper');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });


      currentRow += (groupedNewspaper.length + 5);
  }

  // --- Magazines ---
  const groupedMagazinesRaw = mediaItems.magazines || []; // Get raw items for Magazines
  const groupedMagazines: GroupedItem[] = groupLineItems(groupedMagazinesRaw, "Magazines"); // Group them

  if (groupedMagazines.length > 0) { // Only proceed if there are search items to display
      const magazinesDataStartActualRow = drawSection('Magazines', groupedMagazines, currentRow, 'Press'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedMagazines.forEach((it, idx) => {
        const itemRow = magazinesDataStartActualRow + idx; // Data rows start at magazinesDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'magazines');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });


      currentRow += (groupedMagazines.length + 5);
  }

  // --- OOH ---
  const groupedOohRaw = mediaItems.ooh || []; // Get raw items for OOH
  const groupedOoh: GroupedItem[] = groupLineItems(groupedOohRaw, "OOH"); // Group them

  if (groupedOoh.length > 0) { // Only proceed if there are OOH items to display
      const oohDataStartActualRow = drawSection('OOH', groupedOoh, currentRow, 'OOH'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedOoh.forEach((it, idx) => {
        const itemRow = oohDataStartActualRow + idx; // Data rows start at oohDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'ooh');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`OOH burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedOoh.length + 5);
  }

  // --- Cinema ---
  const groupedCinemaRaw = mediaItems.cinema || []; // Get raw items for Cinema
  const groupedCinema: GroupedItem[] = groupLineItems(groupedCinemaRaw, "Cinema"); // Group them

  if (groupedCinema.length > 0) { // Only proceed if there are cinema items to display
      const cinemaDataStartActualRow = drawSection('Cinema', groupedCinema, currentRow, 'Cinema'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedCinema.forEach((it, idx) => {
        const itemRow = cinemaDataStartActualRow + idx; // Data rows start at cinemaDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'cinema');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Cinema burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedCinema.length + 5);
  }

  // --- Digital Display ---
  const groupedDigiDisplayRaw = mediaItems.digiDisplay || []; // Get raw items for Digital Display
  const groupedDigiDisplay: GroupedItem[] = groupLineItems(groupedDigiDisplayRaw, "Digital Display"); // Group them

  if (groupedDigiDisplay.length > 0) { // Only proceed if there are Digital Display items to display
      const digiDisplayDataStartActualRow = drawSection('Digital Display', groupedDigiDisplay, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedDigiDisplay.forEach((it, idx) => {
        const itemRow = digiDisplayDataStartActualRow + idx; // Data rows start at digiDisplayDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'digital display');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Digital Display burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedDigiDisplay.length + 5);
  }

  // --- Digital Audio ---
  const groupedDigiAudioRaw = mediaItems.digiAudio || []; // Get raw items for Digital Audio
  const groupedDigiAudio: GroupedItem[] = groupLineItems(groupedDigiAudioRaw, "Digital Audio"); // Group them

  if (groupedDigiAudio.length > 0) { // Only proceed if there are Digital Audio items to display
      const digiAudioDataStartActualRow = drawSection('Digital Audio', groupedDigiAudio, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedDigiAudio.forEach((it, idx) => {
        const itemRow = digiAudioDataStartActualRow + idx; // Data rows start at digiAudioDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'digital audio');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Digital Audio burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedDigiAudio.length + 5);
  }

  // --- Digital Video ---
  const groupedDigiVideoRaw = mediaItems.digiVideo || []; // Get raw items for Digital Video
  const groupedDigiVideo: GroupedItem[] = groupLineItems(groupedDigiVideoRaw, "Digital Video"); // Group them

  if (groupedDigiVideo.length > 0) { // Only proceed if there are Digital Video items to display
      const digiVideoDataStartActualRow = drawSection('Digital Video', groupedDigiVideo, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedDigiVideo.forEach((it, idx) => {
        const itemRow = digiVideoDataStartActualRow + idx; // Data rows start at digiVideoDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'digital video');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Digital Video burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedDigiVideo.length + 5);
  }

  // --- BVOD ---
  const groupedBvodRaw = mediaItems.bvod || []; // Get raw items for BVOD
  const groupedBvod: GroupedItem[] = groupLineItems(groupedBvodRaw, "BVOD"); // Group them

  if (groupedBvod.length > 0) { // Only proceed if there are BVOD items to display
      const bvodDataStartActualRow = drawSection('BVOD', groupedBvod, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedBvod.forEach((it, idx) => {
        const itemRow = bvodDataStartActualRow + idx; // Data rows start at bvodDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'bvod');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`BVOD burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedBvod.length + 5);
  }

  // --- SEARCH ---
  const groupedSearchRaw = mediaItems.search || []; // Get raw items for Search
  const groupedSearch: GroupedItem[] = groupLineItems(groupedSearchRaw, "Search"); // Group them

  if (groupedSearch.length > 0) { // Only proceed if there are search items to display
      const searchDataStartActualRow = drawSection('Search', groupedSearch, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedSearch.forEach((it, idx) => {
        const itemRow = searchDataStartActualRow + idx; // Data rows start at searchDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'search');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedSearch.length + 5);
  }

  // --- SOCIAL MEDIA ---
  const groupedSocialMediaRaw = mediaItems.socialMedia || []; // Get raw items for Social Media
  const groupedSocialMedia: GroupedItem[] = groupLineItems(groupedSocialMediaRaw, "Social Media"); // Group them

  if (groupedSocialMedia.length > 0) { // Only proceed if there are search items to display
      const socialMediaDataStartActualRow = drawSection('Social Media', groupedSocialMedia, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedSocialMedia.forEach((it, idx) => {
        const itemRow = socialMediaDataStartActualRow + idx; // Data rows start at socialMediaDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'social media');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });

      currentRow += (groupedSocialMedia.length + 5);
  }

  // --- Programmatic Display ---
  const groupedProgDisplayRaw = mediaItems.progDisplay || []; // Get raw items for Search
  const groupedProgDisplay: GroupedItem[] = groupLineItems(groupedProgDisplayRaw, "Programmatic Display"); // Group them

  if (groupedProgDisplay.length > 0) { // Only proceed if there are search items to display
      const progDisplayDataStartActualRow = drawSection('Programmatic Display', groupedProgDisplay, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedProgDisplay.forEach((it, idx) => {
        const itemRow = progDisplayDataStartActualRow + idx; // Data rows start at progDisplayDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'programmatic display');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });


      currentRow += (groupedProgDisplay.length + 5);
  }

  // --- Programmatic Video ---
  const groupedProgVideoRaw = mediaItems.progVideo || []; // Get raw items for Search
  const groupedProgVideo: GroupedItem[] = groupLineItems(groupedProgVideoRaw, "Programmatic Video"); // Group them

  if (groupedProgVideo.length > 0) { // Only proceed if there are search items to display
      const progVideoDataStartActualRow = drawSection('Programmatic Video', groupedProgVideo, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedProgVideo.forEach((it, idx) => {
        const itemRow = progVideoDataStartActualRow + idx; // Data rows start at progVideoDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'programmatic video');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });


      currentRow += (groupedProgVideo.length + 5);
  }

  // --- Programmatic BVOD ---
  const groupedProgBVODRaw = mediaItems.progBvod || []; // Get raw items for Search
  const groupedProgBVOD: GroupedItem[] = groupLineItems(groupedProgBVODRaw, "Programmatic BVOD"); // Group them

  if (groupedProgBVOD.length > 0) { // Only proceed if there are search items to display
      const progBVODDataStartActualRow = drawSection('Programmatic BVOD', groupedProgBVOD, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedProgBVOD.forEach((it, idx) => {
        const itemRow = progBVODDataStartActualRow + idx; // Data rows start at progBVODDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'programmatic bvod');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });


      currentRow += (groupedProgBVOD.length + 5);
  }

  // --- Programmatic Audio ---
  const groupedProgAudioRaw = mediaItems.progAudio || []; // Get raw items for Search
  const groupedProgAudio: GroupedItem[] = groupLineItems(groupedProgAudioRaw, "Programmatic Audio"); // Group them

  if (groupedProgAudio.length > 0) { // Only proceed if there are search items to display
      const progAudioDataStartActualRow = drawSection('Programmatic Audio', groupedProgAudio, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedProgAudio.forEach((it, idx) => {
        const itemRow = progAudioDataStartActualRow + idx; // Data rows start at progAudioDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'programmatic audio');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });


      currentRow += (groupedProgAudio.length + 5);
  }

  // --- Programmatic OOH ---
  const groupedProgOohRaw = mediaItems.progOoh || []; // Get raw items for Search
  const groupedProgOoh: GroupedItem[] = groupLineItems(groupedProgOohRaw, "Programmatic OOH"); // Group them

  if (groupedProgOoh.length > 0) { // Only proceed if there are search items to display
      const progOohDataStartActualRow = drawSection('Programmatic OOH', groupedProgOoh, currentRow, 'Biddable'); // Draw the section
      
      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate())); //

      groupedProgOoh.forEach((it, idx) => {
        const itemRow = progOohDataStartActualRow + idx; // Data rows start at progOohDataStartActualRow
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime()); //
        
        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate); //
          const burstEnd = parseDateStringYYYYMMDD(b.endDate); //
          
          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay); //
          
          const ganttStart = firstDateCol + startOffset; //
          const ganttEnd = firstDateCol + endOffset; //
          
          // Ensure the burst is within the drawable timeline and worksheet boundaries
          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) { // Check ganttEnd against lastDateCol
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'programmatic ooh');
          } else {
            // Optional: Log if a burst is outside the drawable timeline range for debugging
            // console.warn(`Search burst for item ${idx} (Market: ${it.market}, Creative: ${it.creative}) is outside the drawable timeline: Start ${b.startDate}, End ${b.endDate}. Calculated Gantt: ${ganttStart}-${ganttEnd}`);
          }
        });
      });


      currentRow += (groupedProgOoh.length + 5);
  }

  // --- Integration ---
  const groupedIntegrationRaw = mediaItems.integration || [];
  const groupedIntegration: GroupedItem[] = groupLineItems(groupedIntegrationRaw, "Integration");

  if (groupedIntegration.length > 0) {
      const integrationDataStartActualRow = drawSection('Integration', groupedIntegration, currentRow, 'Biddable');

      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate()));

      groupedIntegration.forEach((it, idx) => {
        const itemRow = integrationDataStartActualRow + idx;
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime());

        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate);
          const burstEnd = parseDateStringYYYYMMDD(b.endDate);

          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay);
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay);

          const ganttStart = firstDateCol + startOffset;
          const ganttEnd = firstDateCol + endOffset;

          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) {
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'integration');
          }
        });
      });

      currentRow += (groupedIntegration.length + 5);
  }

  // --- Influencers ---
  const groupedInfluencersRaw = mediaItems.influencers || [];
  const groupedInfluencers: GroupedItem[] = groupLineItems(groupedInfluencersRaw, "Influencers");

  if (groupedInfluencers.length > 0) {
      const influencersDataStartActualRow = drawSection('Influencers', groupedInfluencers, currentRow, 'Biddable');

      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate()));

      groupedInfluencers.forEach((it, idx) => {
        const itemRow = influencersDataStartActualRow + idx;
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime());

        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate);
          const burstEnd = parseDateStringYYYYMMDD(b.endDate);

          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay);
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay);

          const ganttStart = firstDateCol + startOffset;
          const ganttEnd = firstDateCol + endOffset;

          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) {
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'influencers');
          }
        });
      });

      currentRow += (groupedInfluencers.length + 5);
  }

  // --- Production ---
  const groupedProductionRaw = mediaItems.production || [];
  const groupedProduction: GroupedItem[] = groupLineItems(groupedProductionRaw, "Production");

  if (groupedProduction.length > 0) {
      const productionDataStartActualRow = drawSection('Production', groupedProduction, currentRow, 'Production');

      const firstSundayUTC = new Date(Date.UTC(firstSunday.getFullYear(), firstSunday.getMonth(), firstSunday.getDate()));

      groupedProduction.forEach((it, idx) => {
        const itemRow = productionDataStartActualRow + idx;
        const sortedBursts = [...it.bursts].sort((a, b) => parseDateStringYYYYMMDD(a.startDate).getTime() - parseDateStringYYYYMMDD(b.startDate).getTime());

        sortedBursts.forEach(b => {
          const burstStart = parseDateStringYYYYMMDD(b.startDate);
          const burstEnd = parseDateStringYYYYMMDD(b.endDate);

          const startOffset = Math.round((burstStart.getTime() - firstSundayUTC.getTime()) / msPerDay);
          const endOffset = Math.round((burstEnd.getTime() - firstSundayUTC.getTime()) / msPerDay);

          const ganttStart = firstDateCol + startOffset;
          const ganttEnd = firstDateCol + endOffset;

          if (ganttStart <= ganttEnd && ganttStart >= firstDateCol && ganttEnd <= lastDateCol) {
            mergeBurstCells(itemRow, ganttStart, ganttEnd, b.deliverables, 'production');
          }
        });
      });

      currentRow += (groupedProduction.length + 5);
  }

  // --- Grand Total Row by Month (before MBA table) ---
  if (monthRanges.length > 0 && Object.keys(monthlyByChannel).length > 0) {
    const headerLastColNum = Math.max(14, lastDateCol);

    const monthlyGrandTotals: Record<string, number> = {};
    for (const { monthYear } of monthRanges) {
      monthlyGrandTotals[monthYear] = Object.keys(monthlyByChannel).reduce((sum, key) => {
        return sum + (monthlyByChannel[key]?.[monthYear] ?? 0);
      }, 0);
    }
    const totalGrossMediaFromMonths = Object.values(monthlyGrandTotals).reduce((s, v) => s + v, 0);

    const serviceFeeTotal = mbaData?.totals?.service_fee ?? 0;
    const adServingTotal = mbaData?.totals?.adserving ?? 0;

    const monthlyServiceFee: Record<string, number> = {};
    const monthlyAdServing: Record<string, number> = {};
    for (const { monthYear } of monthRanges) {
      const ratio = totalGrossMediaFromMonths > 0
        ? (monthlyGrandTotals[monthYear] ?? 0) / totalGrossMediaFromMonths
        : 0;
      monthlyServiceFee[monthYear] = serviceFeeTotal * ratio;
      monthlyAdServing[monthYear] = adServingTotal * ratio;
    }

    const summaryRowFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

    if (mbaTotalsLayout === 'standard' && serviceFeeTotal > 0) {
      for (let colNum = 2; colNum <= headerLastColNum; colNum++) {
        style(sheet.getCell(currentRow, colNum), { fill: summaryRowFill });
      }
      sheet.mergeCells(currentRow, 2, currentRow, 12);
      style(sheet.getCell(currentRow, 2), {
        value: 'Service Fee',
        bold: true,
        align: 'right',
        fill: summaryRowFill,
        fontColor: 'FF000000'
      });
      style(sheet.getCell(currentRow, 14), {
        value: serviceFeeTotal,
        bold: true,
        align: 'right',
        numFmt: '$#,##0.00',
        fill: summaryRowFill,
        fontColor: 'FF000000'
      });
      for (const { monthYear, startCol, endCol } of monthRanges) {
        const amount = monthlyServiceFee[monthYear] ?? 0;
        if (startCol < endCol) {
          try {
            sheet.mergeCells(currentRow, startCol, currentRow, endCol);
          } catch {
            // Cell may already be part of a merge
          }
        }
        const cell = sheet.getCell(currentRow, startCol);
        style(cell, {
          value: amount,
          fontSize: 14,
          bold: true,
          align: 'center',
          verticalAlign: 'middle',
          fill: summaryRowFill,
          fontColor: 'FF000000',
          numFmt: '$#,##0.00'
        });
        cell.border = lightDashedBorder;
      }
      currentRow++;
    }

    if (mbaTotalsLayout === 'standard' && adServingTotal > 0) {
      for (let colNum = 2; colNum <= headerLastColNum; colNum++) {
        style(sheet.getCell(currentRow, colNum), { fill: summaryRowFill });
      }
      sheet.mergeCells(currentRow, 2, currentRow, 12);
      style(sheet.getCell(currentRow, 2), {
        value: 'Ad Serving & Tech',
        bold: true,
        align: 'right',
        fill: summaryRowFill,
        fontColor: 'FF000000'
      });
      style(sheet.getCell(currentRow, 14), {
        value: adServingTotal,
        bold: true,
        align: 'right',
        numFmt: '$#,##0.00',
        fill: summaryRowFill,
        fontColor: 'FF000000'
      });
      for (const { monthYear, startCol, endCol } of monthRanges) {
        const amount = monthlyAdServing[monthYear] ?? 0;
        if (startCol < endCol) {
          try {
            sheet.mergeCells(currentRow, startCol, currentRow, endCol);
          } catch {
            // Cell may already be part of a merge
          }
        }
        const cell = sheet.getCell(currentRow, startCol);
        style(cell, {
          value: amount,
          fontSize: 14,
          bold: true,
          align: 'center',
          verticalAlign: 'middle',
          fill: summaryRowFill,
          fontColor: 'FF000000',
          numFmt: '$#,##0.00'
        });
        cell.border = lightDashedBorder;
      }
      currentRow++;
    }

    const totalFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFBDDC52' } };
    const grossMediaMbaTotal = mbaData?.totals?.gross_media ?? 0;
    const grandTotalColN = mbaTotalsLayout === 'standard'
      ? grossMediaMbaTotal + serviceFeeTotal + adServingTotal
      : grossMediaMbaTotal;

    for (let colNum = 2; colNum <= headerLastColNum; colNum++) {
      style(sheet.getCell(currentRow, colNum), { fill: totalFill });
    }
    sheet.mergeCells(currentRow, 2, currentRow, 12);
    style(sheet.getCell(currentRow, 2), {
      value: 'Total',
      bold: true,
      align: 'right',
      fill: totalFill,
      fontColor: 'FF000000'
    });

    style(sheet.getCell(currentRow, 14), {
      value: grandTotalColN,
      bold: true,
      align: 'right',
      numFmt: '$#,##0.00',
      fill: totalFill,
      fontColor: 'FF000000'
    });

    for (const { monthYear, startCol, endCol } of monthRanges) {
      const grossForMonth = monthlyGrandTotals[monthYear] ?? 0;
      const totalForMonth = mbaTotalsLayout === 'standard'
        ? grossForMonth + (monthlyServiceFee[monthYear] ?? 0) + (monthlyAdServing[monthYear] ?? 0)
        : grossForMonth;
      if (startCol < endCol) {
        try {
          sheet.mergeCells(currentRow, startCol, currentRow, endCol);
        } catch {
          // Cell may already be part of a merge
        }
      }
      const cell = sheet.getCell(currentRow, startCol);
      style(cell, {
        value: totalForMonth,
        fontSize: 14,
        bold: true,
        align: 'center',
        verticalAlign: 'middle',
        fill: totalFill,
        fontColor: 'FF000000',
        numFmt: '$#,##0.00'
      });
      cell.border = lightDashedBorder;
    }
    currentRow++;
  }

  // --- MBA Details Section ---
  if (mbaData) {
    // Start directly with the MBA data (no heading)

    // Gross Media Breakdown
    const tableStartRow = currentRow;
    if (mbaData.gross_media && mbaData.gross_media.length > 0) {
      style(sheet.getCell(currentRow, 13), {
        value: 'Media Type',
        fontSize: 15,
        bold: true,
        align: 'left'
      });
      style(sheet.getCell(currentRow, 14), {
        value: 'Gross Amount',
        fontSize: 15,
        bold: true,
        align: 'right'
      });
      currentRow++;

      mbaData.gross_media.forEach(item => {
        style(sheet.getCell(currentRow, 13), {
          value: item.media_type,
          fontSize: 15,
          align: 'left'
        });
        style(sheet.getCell(currentRow, 14), {
          value: item.gross_amount,
          fontSize: 15,
          align: 'right',
          numFmt: '$#,##0.00'
        });
        currentRow++;
      });
      currentRow++; // Add space after media breakdown
    }

    // Totals Section
    if (mbaData.totals) {
      const totals = mbaData.totals;
      
      style(sheet.getCell(currentRow, 13), {
        value: 'Total Gross Media:',
        fontSize: 15,
        bold: true,
        align: 'left'
      });
      style(sheet.getCell(currentRow, 14), {
        value: totals.gross_media,
        fontSize: 15,
        align: 'right',
        numFmt: '$#,##0.00'
      });
      currentRow++;

      if (mbaTotalsLayout === 'standard') {
        style(sheet.getCell(currentRow, 13), {
          value: 'Service Fee:',
          fontSize: 15,
          bold: true,
          align: 'left'
        });
        style(sheet.getCell(currentRow, 14), {
          value: totals.service_fee,
          fontSize: 15,
          align: 'right',
          numFmt: '$#,##0.00'
        });
        currentRow++;
      }

      style(sheet.getCell(currentRow, 13), {
        value: 'Production:',
        fontSize: 15,
        bold: true,
        align: 'left'
      });
      style(sheet.getCell(currentRow, 14), {
        value: totals.production,
        fontSize: 15,
        align: 'right',
        numFmt: '$#,##0.00'
      });
      currentRow++;

      if (mbaTotalsLayout === 'standard') {
        style(sheet.getCell(currentRow, 13), {
          value: 'Adserving/Tech:',
          fontSize: 15,
          bold: true,
          align: 'left'
        });
        style(sheet.getCell(currentRow, 14), {
          value: totals.adserving,
          fontSize: 15,
          align: 'right',
          numFmt: '$#,##0.00'
        });
        currentRow++;
      }

      // Add separator line
      currentRow++;
      style(sheet.getCell(currentRow, 13), {
        value: 'Total Ex GST:',
        fontSize: 15,
        bold: true,
        align: 'left',
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } }
      });
      style(sheet.getCell(currentRow, 14), {
        value: totals.totals_ex_gst,
        fontSize: 15,
        bold: true,
        align: 'right',
        numFmt: '$#,##0.00',
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6E6E6' } }
      });
      currentRow++;

      style(sheet.getCell(currentRow, 13), {
        value: 'Total Inc GST:',
        fontSize: 15,
        bold: true,
        align: 'left',
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4E6F1' } }
      });
      style(sheet.getCell(currentRow, 14), {
        value: totals.total_inc_gst,
        fontSize: 15,
        bold: true,
        align: 'right',
        numFmt: '$#,##0.00',
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4E6F1' } }
      });
      const tableEndRow = currentRow;
      
      // Add solid borders around the entire table
      const tableStartCol = 13; // Column M
      const tableEndCol = 14; // Column N
      
      // Top border
      for (let cIdx = tableStartCol; cIdx <= tableEndCol; cIdx++) {
        const cell = sheet.getCell(tableStartRow, cIdx);
        cell.border = { ...cell.border, top: { style: 'thin', color: { argb: 'FF000000' } } };
      }
      
      // Bottom border
      for (let cIdx = tableStartCol; cIdx <= tableEndCol; cIdx++) {
        const cell = sheet.getCell(tableEndRow, cIdx);
        cell.border = { ...cell.border, bottom: { style: 'thin', color: { argb: 'FF000000' } } };
      }
      
      // Left border
      for (let rIdx = tableStartRow; rIdx <= tableEndRow; rIdx++) {
        const cell = sheet.getCell(rIdx, tableStartCol);
        cell.border = { ...cell.border, left: { style: 'thin', color: { argb: 'FF000000' } } };
      }
      
      // Right border
      for (let rIdx = tableStartRow; rIdx <= tableEndRow; rIdx++) {
        const cell = sheet.getCell(rIdx, tableEndCol);
        cell.border = { ...cell.border, right: { style: 'thin', color: { argb: 'FF000000' } } };
      }
    }
  }

  return workbook;
}

export function addKPISheet(
  workbook: ExcelJS.Workbook,
  kpiRows: KPISheetRow[]
): void {
  if (!kpiRows || kpiRows.length === 0) return

  const ws = workbook.addWorksheet('Campaign KPIs')
  ws.views = [{ state: 'normal', showGridLines: false }]

  // Column widths: A=3, B=28, C=32, D=18, E=14, F=14, G=10, H=10,
  //                I=10, J=10, K=10, L=14, M=14, N=14
  const colWidths = [3, 28, 32, 18, 14, 14, 10, 10, 10, 10, 10, 14, 14, 14]
  colWidths.forEach((w, i) => { ws.getColumn(i + 1).width = w })

  let r = 1

  // Title row
  ws.mergeCells(r, 1, r, 14)
  const titleCell = ws.getCell(r, 1)
  titleCell.value = 'Campaign KPIs'
  titleCell.font = { name: 'Aptos', size: 20, bold: true }
  titleCell.alignment = { horizontal: 'left', vertical: 'middle' }
  ws.getRow(r).height = 30
  r++

  // Blank row
  r++

  // Group rows by mediaType preserving order of first appearance
  const groups = new Map<string, KPISheetRow[]>()
  for (const row of kpiRows) {
    if (!groups.has(row.mediaType)) groups.set(row.mediaType, [])
    groups.get(row.mediaType)!.push(row)
  }

  const COL_HEADERS = [
    '', 'Publisher', 'Creative / Targeting', 'Buy Type',
    'Spend', 'Deliverables', 'CTR', 'VTR', 'CPV', 'Conv Rate',
    'Frequency', 'Est. Clicks', 'Est. Views', 'Est. Reach',
  ]

  const numFmt = (cell: ExcelJS.Cell, fmt: string, value: number, bold = false) => {
    cell.value = value
    cell.numFmt = fmt
    cell.alignment = { horizontal: 'right', vertical: 'middle' }
    if (bold) cell.font = { name: 'Aptos', size: 10, bold: true }
  }

  const txt = (cell: ExcelJS.Cell, value: string, bold = false, color?: string) => {
    cell.value = value
    cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: false }
    cell.font = { name: 'Aptos', size: 10, bold, color: color ? { argb: color } : undefined }
  }

  const fillCell = (cell: ExcelJS.Cell, argb: string) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  }

  for (const [mediaType, rows] of groups) {
    const label = KPI_MEDIA_LABELS[mediaType] ?? mediaType
    const color = KPI_MEDIA_COLORS[mediaType] ?? 'FF333333'
    const tint  = KPI_MEDIA_TINTS[mediaType]  ?? 'FFF0F0F0'

    // — Media type header row —
    ws.mergeCells(r, 1, r, 14)
    const hdrCell = ws.getCell(r, 1)
    txt(hdrCell, label, true, 'FFFFFFFF')
    fillCell(hdrCell, color)
    ws.getRow(r).height = 18
    r++

    // — Column header row —
    COL_HEADERS.forEach((h, i) => {
      const cell = ws.getCell(r, i + 1)
      cell.value = h
      cell.font = { name: 'Aptos', size: 9, bold: true, color: { argb: 'FF333333' } }
      cell.alignment = { horizontal: i >= 4 ? 'right' : 'left', vertical: 'middle' }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } }
    })
    ws.getRow(r).height = 14
    r++

    // — Data rows —
    rows.forEach((row, idx) => {
      const rowFill = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8F8F8'
      for (let c = 1; c <= 14; c++) {
        fillCell(ws.getCell(r, c), rowFill)
        ws.getCell(r, c).font = { name: 'Aptos', size: 10 }
      }
      txt(ws.getCell(r, 2), row.publisher)
      txt(ws.getCell(r, 3), row.label)
      txt(ws.getCell(r, 4), row.buyType)
      numFmt(ws.getCell(r, 5),  '$#,##0.00', row.spend)
      numFmt(ws.getCell(r, 6),  '#,##0',     row.deliverables)
      numFmt(ws.getCell(r, 7),  '0.00%',     row.ctr)
      numFmt(ws.getCell(r, 8),  '0.00%',     row.vtr)
      numFmt(ws.getCell(r, 9),  '$#,##0.00##', row.cpv)
      numFmt(ws.getCell(r, 10), '0.00%',     row.conversion_rate)
      numFmt(ws.getCell(r, 11), '0.0',       row.frequency)
      numFmt(ws.getCell(r, 12), '#,##0',     row.calculatedClicks)
      numFmt(ws.getCell(r, 13), '#,##0',     row.calculatedViews)
      numFmt(ws.getCell(r, 14), '#,##0',     row.calculatedReach)
      ws.getRow(r).height = 14
      r++
    })

    // — Channel subtotal row —
    const sumField = (f: keyof KPISheetRow) =>
      rows.reduce((s, rw) => s + (rw[f] as number), 0)

    for (let c = 1; c <= 14; c++) fillCell(ws.getCell(r, c), tint)
    ws.mergeCells(r, 1, r, 4)
    txt(ws.getCell(r, 1), `Total ${label}`, true)
    fillCell(ws.getCell(r, 1), tint)
    numFmt(ws.getCell(r, 5),  '$#,##0.00', sumField('spend'),              true)
    numFmt(ws.getCell(r, 6),  '#,##0',     sumField('deliverables'),       true)
    // cols 7-11 (KPI benchmarks): leave blank for subtotal
    numFmt(ws.getCell(r, 12), '#,##0',     sumField('calculatedClicks'),   true)
    numFmt(ws.getCell(r, 13), '#,##0',     sumField('calculatedViews'),    true)
    numFmt(ws.getCell(r, 14), '#,##0',     sumField('calculatedReach'),    true)
    ws.getRow(r).height = 15
    r++

    // blank gap between groups
    r++
  }

  // — Grand total row —
  const allRows = kpiRows
  for (let c = 1; c <= 14; c++) fillCell(ws.getCell(r, c), 'FFBDDC52')
  ws.mergeCells(r, 1, r, 4)
  txt(ws.getCell(r, 1), 'Grand Total', true)
  fillCell(ws.getCell(r, 1), 'FFBDDC52')
  const grandSum = (f: keyof KPISheetRow) =>
    allRows.reduce((s, rw) => s + (rw[f] as number), 0)
  numFmt(ws.getCell(r, 5),  '$#,##0.00', grandSum('spend'),              true)
  numFmt(ws.getCell(r, 6),  '#,##0',     grandSum('deliverables'),       true)
  numFmt(ws.getCell(r, 12), '#,##0',     grandSum('calculatedClicks'),   true)
  numFmt(ws.getCell(r, 13), '#,##0',     grandSum('calculatedViews'),    true)
  numFmt(ws.getCell(r, 14), '#,##0',     grandSum('calculatedReach'),    true)
  ws.getRow(r).height = 16
}