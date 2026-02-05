// /lib/generateMBA.ts

import { jsPDF } from "jspdf";
import { readFileSync } from 'fs';
import { join } from 'path';

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
  };
  billingSchedule: { monthYear: string; totalAmount: string }[];
}

// Helper function to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
};

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

  const margin = {
    top: 25, // Increased top margin for logo
    left: 20,
    right: 20,
    bottom: 20,
  };
  const pageW = doc.internal.pageSize.getWidth() - margin.left - margin.right;
  let y = margin.top;
  const lineHeight = 5;

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
    doc.text(formatCurrency(item.gross_amount), margin.left + pageW, y, { align: 'right' });
    y += lineHeight;
  });
  y += lineHeight;

  // Totals Section
  const totalsX = margin.left + (pageW / 2);
  const valueX = margin.left + pageW;

  doc.setFont("helvetica", "bold");
  doc.text('Total Gross Media:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatCurrency(mbaData.totals.gross_media), valueX, y, { align: 'right' });
  y += lineHeight;
  
  doc.setFont("helvetica", "bold");
  doc.text('Service Fee:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatCurrency(mbaData.totals.service_fee), valueX, y, { align: 'right' });
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text('Production:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatCurrency(mbaData.totals.production), valueX, y, { align: 'right' });
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text('Adserving/Tech:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatCurrency(mbaData.totals.adserving), valueX, y, { align: 'right' });
  y += lineHeight;

  doc.setFont("helvetica", "bold");
  doc.text('Total ex. GST:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatCurrency(mbaData.totals.totals_ex_gst), valueX, y, { align: 'right' });
  y += lineHeight;
  
  doc.setFont("helvetica", "bold");
  doc.text('Total inc. GST:', totalsX, y, { align: 'right' });
  doc.setFont("helvetica", "normal");
  doc.text(formatCurrency(mbaData.totals.total_inc_gst), valueX, y, { align: 'right' });
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
  doc.text('Amount (inc. GST)', margin.left + pageW, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(0);
  doc.line(margin.left, y, margin.left + pageW, y); // horizontal line
  y += lineHeight;
  
  doc.setFont("helvetica", "normal");
  mbaData.billingSchedule.forEach(b => {
    doc.text(b.monthYear, margin.left, y);
    doc.text(formatCurrency(parseCurrency(b.totalAmount)), margin.left + pageW, y, { align: 'right' });
    y += lineHeight;
  });

  // Return the generated PDF as a Blob.
  return doc.output('blob');
}