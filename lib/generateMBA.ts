// /lib/generateMBA.ts

import { jsPDF } from "jspdf";
import { createHash } from "node:crypto";
import { readFileSync } from 'fs';
import { join } from 'path';
import { formatAUD } from "./format/money";
import { formatMbaScopeLine } from "./docs/mbaScope";

// Keep your existing MBAData interface
export interface MBAData {
  date: string;
  mba_number: string;
  campaign_name: string;
  campaign_brand: string;
  po_number: string;
  media_plan_version: string;
  client: {
    name: string;
    streetaddress: string;
    suburb: string;
    state: string;
    postcode: string;
  };
  campaign: {
    date_start: string;
    date_end: string;
  };
  gross_media: { media_type: string; gross_amount: number }[];
  totals: {
    gross_media: number;
    service_fee: number;
    production: number;
    adserving: number;
    totals_ex_gst: number;
    total_inc_gst: number;
    client_paid_media?: number;
    billing_ex_gst?: number;
    billing_inc_gst?: number;
  };
  billingSchedule: { monthYear: string; totalAmount: string }[];
  /** PC3 checksum footer: `v{n} · {hash8}` — drawn on every page. */
  checksumFooter?: string;
  /** Coverage of a partial MBA. Omitted or `partial: false` → no scope line. */
  scope?: {
    partial: boolean;
    includedMediaTypes: string[];
    excludedMediaTypes: string[];
    includedMonths: string[];
    excludedMonths: string[];
    includedLineCount: number;
    totalLineCount: number;
  };
}

const parseCurrency = (value: string | number | null | undefined): number => {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0
  if (!value) return 0
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""))
  return Number.isFinite(parsed) ? parsed : 0
}

// Helper to fetch the logo and convert it to a format jspdf can use
// Works in both browser and Node.js environments
const getImageBase64 = async (url: string) => {
    try {
        // Check if we're in a browser environment
        if (typeof window !== 'undefined') {
            // Browser environment: use fetch
            const response = await fetch(url);
            const buffer = await response.arrayBuffer();
            let binary = '';
            const bytes = new Uint8Array(buffer);
            bytes.forEach((b) => binary += String.fromCharCode(b));
            return window.btoa(binary);
        } else {
            // Node.js environment: read from filesystem
            const logoPath = join(process.cwd(), 'public', url.replace(/^\//, ''));
            const imageBuffer = readFileSync(logoPath);
            return imageBuffer.toString('base64');
        }
    } catch (error) {
        console.error("Error loading image for PDF:", error);
        return null;
    }
};


export async function generateMBA(mbaData: MBAData): Promise<Blob> {
  // Fetch the logo first
  const logoBase64 = await getImageBase64('/assembled-logo.png');

  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  // Deterministic PDF metadata — same input ⇒ byte-identical output (PC3).
  // (jsPDF DocumentProperties typings omit creationDate/modDate; cast is intentional.)
  const fixedDate = new Date(Date.UTC(1970, 0, 1, 0, 0, 0));
  doc.setProperties({
    title: `MBA ${mbaData.mba_number} v${mbaData.media_plan_version}`,
    subject: mbaData.campaign_name || "MBA",
    author: "AssembledView",
    creator: "AssembledView",
    keywords: mbaData.checksumFooter || "",
    creationDate: fixedDate,
    modDate: fixedDate,
  } as Parameters<typeof doc.setProperties>[0]);

  const margin = {
    top: 25, // Increased top margin for logo
    left: 20,
    right: 20,
    bottom: 20,
  };
  const pageW = doc.internal.pageSize.getWidth() - margin.left - margin.right;
  let y = margin.top;
  const lineHeight = 5;

  const drawChecksumFooter = () => {
    if (!mbaData.checksumFooter) return;
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(
      mbaData.checksumFooter,
      margin.left + pageW,
      pageH - 10,
      { align: "right" }
    );
  };

  // --- Add Logo to the top right ---
  if (logoBase64) {
    const logoWidth = 45; // Width of logo in mm
    const logoHeight = 9; // Height of logo in mm
    const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
    const logoY = margin.top - 15; // Position it within the top margin area
    doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
  }

  // --- Document Content Generation ---

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Date: ${mbaData.date}`, margin.left, y);
  // This was previously aligned to the right margin, which would clash with the logo.
  // We'll move it below the other header info or handle differently if needed.
  // For now, let's keep it simple.
  y += lineHeight * 2;

  // Campaign Info
  doc.setFont("helvetica", "normal");
  doc.text(`MBA: ${mbaData.mba_number}`, margin.left, y);
  y += lineHeight;
  doc.text(`Campaign Name: ${mbaData.campaign_name}`, margin.left, y);
  doc.text(`Campaign Brand: ${mbaData.campaign_brand}`, margin.left + pageW, y, { align: 'right' });
  y += lineHeight;
  doc.text(`PO Number: ${mbaData.po_number}`, margin.left, y);
  doc.text(`Media Plan Version: ${mbaData.media_plan_version}`, margin.left + pageW, y, { align: 'right' });
  y += lineHeight;
  const scopeLine = formatMbaScopeLine(mbaData.scope);
  if (scopeLine) {
    doc.text(scopeLine, margin.left, y);
    y += lineHeight;
  }
  y += lineHeight * 2;
  
  // Client Address
  doc.setFont("helvetica", "bold");
  doc.text(mbaData.client.name, margin.left, y);
  y += lineHeight;
  doc.setFont("helvetica", "normal");
  doc.text(mbaData.client.streetaddress, margin.left, y);
  y += lineHeight;
  doc.text(`${mbaData.client.suburb}, ${mbaData.client.state} ${mbaData.client.postcode}`, margin.left, y);
  y += lineHeight * 2;

  // Dates
  doc.text(`Campaign Dates: From ${mbaData.campaign.date_start} to ${mbaData.campaign.date_end}`, margin.left, y);
  y += lineHeight * 2;

  // Gross Media Table
  doc.setFont("helvetica", "bold");
  doc.text('Media Type', margin.left, y);
  doc.text('Gross Media', margin.left + pageW, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(0);
  doc.line(margin.left, y, margin.left + pageW, y); // horizontal line
  y += lineHeight;

  doc.setFont("helvetica", "normal");
  mbaData.gross_media.forEach(item => {
    doc.text(item.media_type, margin.left, y);
    doc.text(formatAUD(item.gross_amount), margin.left + pageW, y, { align: 'right' });
    y += lineHeight;
  });
  y += lineHeight;

  // Totals Section
  const totalsX = margin.left + (pageW / 2);
  const valueX = margin.left + pageW;

  doc.setFont("helvetica", "bold");
  doc.text('Total Gross Media:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatAUD(mbaData.totals.gross_media), valueX, y, { align: 'right' });
  y += lineHeight;

  if (mbaData.totals.client_paid_media != null) {
    doc.setFont("helvetica", "bold");
    doc.text('Client Paid Media:', totalsX, y, { align: 'right' });
    doc.setFont("helvetica", "normal");
    doc.text(formatAUD(mbaData.totals.client_paid_media), valueX, y, { align: 'right' });
    y += lineHeight;
  }
  
  doc.setFont("helvetica", "bold");
  doc.text('Service Fee:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatAUD(mbaData.totals.service_fee), valueX, y, { align: 'right' });
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text('Production:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatAUD(mbaData.totals.production), valueX, y, { align: 'right' });
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text('Adserving/Tech:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatAUD(mbaData.totals.adserving), valueX, y, { align: 'right' });
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text('Total ex. GST:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatAUD(mbaData.totals.totals_ex_gst), valueX, y, { align: 'right' });
  y += lineHeight;
  
  doc.setFont("helvetica", "bold");
  doc.text('Total inc. GST:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatAUD(mbaData.totals.total_inc_gst), valueX, y, { align: 'right' });
  y += lineHeight * 3;

  // Client Approval
  doc.setFont("helvetica", "bold");
  doc.text('Client Approval', margin.left, y);
  y += lineHeight * 1.5;

  ['Name:', 'Position:', 'Signature:', 'Date:'].forEach(label => {
    doc.setFont("helvetica", "normal");
    doc.text(label, margin.left, y);
    doc.line(margin.left + 25, y, margin.left + pageW, y); // signature line
    y += lineHeight * 2;
  });

  // --- ADD A NEW PAGE FOR THE BILLING SCHEDULE ---
  doc.addPage();
  y = margin.top; // Reset Y position for the new page

  // --- Add Logo to the top right of the second page ---
  if (logoBase64) {
    const logoWidth = 45; // Width of logo in mm
    const logoHeight = 9; // Height of logo in mm
    const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
    const logoY = margin.top - 15; // Position it within the top margin area
    doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
  }

  // --- Billing Schedule Section ---
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text('Billing Schedule', margin.left, y);
  y += lineHeight * 2;
  
  doc.setFontSize(9);
  doc.text('Month', margin.left, y);
  doc.text('Amount (ex. GST)', margin.left + pageW, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(0);
  doc.line(margin.left, y, margin.left + pageW, y); // horizontal line
  y += lineHeight;
  
  doc.setFont("helvetica", "normal");
  mbaData.billingSchedule.forEach(b => {
    doc.text(b.monthYear, margin.left, y);
    doc.text(formatAUD(parseCurrency(b.totalAmount)), margin.left + pageW, y, { align: 'right' });
    y += lineHeight;
  });

  y += 2;
  doc.setDrawColor(0);
  doc.line(margin.left, y, margin.left + pageW, y); // divider above grand totals
  y += lineHeight;

  const billingTotalsX = margin.left + (pageW / 2);
  const billingValueX = margin.left + pageW;

  doc.setFont("helvetica", "bold");
  doc.text('Total (ex. GST):', billingTotalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(
    formatAUD(mbaData.totals.billing_ex_gst ?? mbaData.totals.totals_ex_gst),
    billingValueX,
    y,
    { align: 'right' }
  );
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text('Total (inc. GST):', billingTotalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(
    formatAUD(mbaData.totals.billing_inc_gst ?? mbaData.totals.total_inc_gst),
    billingValueX,
    y,
    { align: 'right' }
  );

  // PC3: checksum footer on every page.
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawChecksumFooter();
  }

  // jsPDF stamps a random /ID in the trailer — replace with a deterministic
  // hash so identical MBAData ⇒ byte-identical PDF (PC3 fixture law).
  const raw = Buffer.from(doc.output("arraybuffer"));
  const seed = [
    mbaData.mba_number,
    mbaData.media_plan_version,
    mbaData.checksumFooter || "",
    mbaData.date,
    String(mbaData.totals.totals_ex_gst),
  ].join("|");
  const idHex = createHash("sha256").update(seed).digest("hex").toUpperCase().slice(0, 32);
  const latin1 = raw.toString("latin1");
  const stabilized = latin1.replace(
    /\/ID\s*\[\s*<[0-9A-Fa-f]+>\s*<[0-9A-Fa-f]+>\s*\]/,
    `/ID [ <${idHex}> <${idHex}> ]`
  );
  return new Blob([Buffer.from(stabilized, "latin1")], { type: "application/pdf" });
}