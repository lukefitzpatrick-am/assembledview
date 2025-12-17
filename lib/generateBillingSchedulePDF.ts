import { jsPDF } from "jspdf";
import { readFileSync } from 'fs';
import { join } from 'path';

export interface BillingSchedulePDFData {
  date: string;
  mba_number: string;
  campaign_name: string;
  campaign_brand: string;
  client_name: string;
  billingSchedule: Array<{
    monthYear: string;
    totalAmount?: string;
    mediaTypes?: Array<{
      mediaType: string;
      lineItems: Array<{
        header1: string;
        header2: string;
        amount: string;
      }>;
    }>;
    feeTotal?: string;
    adservingTechFees?: string;
    production?: string;
  }>;
}

// Helper function to format currency
const formatCurrency = (amount: number | string) => {
  if (typeof amount === 'string') {
    // Extract numeric value from currency string
    const num = parseFloat(amount.replace(/[^0-9.-]+/g, '')) || 0
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(num);
  }
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
};

// Helper to fetch the logo and convert it to a format jspdf can use
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

export async function generateBillingSchedulePDF(data: BillingSchedulePDFData): Promise<Blob> {
  // Fetch the logo first
  const logoBase64 = await getImageBase64('/assembled-logo.png');

  const doc = new jsPDF({
    orientation: 'p',
    unit: 'mm',
    format: 'a4',
  });

  const margin = {
    top: 25,
    left: 20,
    right: 20,
    bottom: 20,
  };
  const pageW = doc.internal.pageSize.getWidth() - margin.left - margin.right;
  let y = margin.top;
  const lineHeight = 5;
  const maxY = doc.internal.pageSize.getHeight() - margin.bottom;

  // Add Logo to the top right
  if (logoBase64) {
    const logoWidth = 45;
    const logoHeight = 9;
    const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
    const logoY = margin.top - 15;
    doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
  }

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text('Billing Schedule', margin.left, y);
  y += lineHeight * 2;

  // Campaign Info
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date: ${data.date}`, margin.left, y);
  y += lineHeight;
  doc.text(`MBA: ${data.mba_number}`, margin.left, y);
  y += lineHeight;
  doc.text(`Campaign: ${data.campaign_name}`, margin.left, y);
  doc.text(`Brand: ${data.campaign_brand}`, margin.left + pageW, y, { align: 'right' });
  y += lineHeight;
  doc.text(`Client: ${data.client_name}`, margin.left, y);
  y += lineHeight * 2;

  // Billing Schedule Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text('Month', margin.left, y);
  doc.text('Amount (inc. GST)', margin.left + pageW, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(0);
  doc.line(margin.left, y, margin.left + pageW, y);
  y += lineHeight;

  doc.setFont("helvetica", "normal");
  
  // Process billing schedule entries
  data.billingSchedule.forEach((entry) => {
    // Check if we need a new page
    if (y > maxY - lineHeight * 5) {
      doc.addPage();
      y = margin.top;
      
      // Add logo to new page
      if (logoBase64) {
        const logoWidth = 45;
        const logoHeight = 9;
        const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
        const logoY = margin.top - 15;
        doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
      }
    }

    // Month and total amount
    doc.setFont("helvetica", "bold");
    doc.text(entry.monthYear, margin.left, y);
    
    // Calculate total for this month
    let monthTotal = 0
    
    if (entry.totalAmount) {
      monthTotal = parseFloat(entry.totalAmount.replace(/[^0-9.-]+/g, '')) || 0
    } else {
      // Calculate from media types and fees
      if (entry.mediaTypes) {
        entry.mediaTypes.forEach(mt => {
          mt.lineItems.forEach(li => {
            const amount = parseFloat(li.amount.replace(/[^0-9.-]+/g, '')) || 0
            monthTotal += amount
          })
        })
      }
      if (entry.feeTotal) {
        monthTotal += parseFloat(entry.feeTotal.replace(/[^0-9.-]+/g, '')) || 0
      }
      if (entry.adservingTechFees) {
        monthTotal += parseFloat(entry.adservingTechFees.replace(/[^0-9.-]+/g, '')) || 0
      }
      if (entry.production) {
        monthTotal += parseFloat(entry.production.replace(/[^0-9.-]+/g, '')) || 0
      }
      // Add GST (10%)
      monthTotal = monthTotal * 1.1
    }
    
    doc.text(formatCurrency(monthTotal), margin.left + pageW, y, { align: 'right' });
    y += lineHeight;

    // Optional: Add breakdown by media type if available
    if (entry.mediaTypes && entry.mediaTypes.length > 0) {
      entry.mediaTypes.forEach(mediaType => {
        if (y > maxY - lineHeight * 3) {
          doc.addPage();
          y = margin.top;
          if (logoBase64) {
            const logoWidth = 45;
            const logoHeight = 9;
            const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
            const logoY = margin.top - 15;
            doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
          }
        }
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(`  ${mediaType.mediaType}:`, margin.left + 5, y);
        y += lineHeight * 0.8;
        
        mediaType.lineItems.forEach(lineItem => {
          if (y > maxY - lineHeight * 2) {
            doc.addPage();
            y = margin.top;
            if (logoBase64) {
              const logoWidth = 45;
              const logoHeight = 9;
              const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
              const logoY = margin.top - 15;
              doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
            }
          }
          
          doc.text(`    ${lineItem.header1} - ${lineItem.header2}`, margin.left + 10, y);
          doc.text(lineItem.amount, margin.left + pageW, y, { align: 'right' });
          y += lineHeight * 0.7;
        })
      })
    }

    // Add fees if present
    if (entry.feeTotal) {
      if (y > maxY - lineHeight * 2) {
        doc.addPage();
        y = margin.top;
        if (logoBase64) {
          const logoWidth = 45;
          const logoHeight = 9;
          const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
          const logoY = margin.top - 15;
          doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
        }
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`  Service Fee: ${entry.feeTotal}`, margin.left + 5, y);
      y += lineHeight * 0.8;
    }

    if (entry.adservingTechFees) {
      if (y > maxY - lineHeight * 2) {
        doc.addPage();
        y = margin.top;
        if (logoBase64) {
          const logoWidth = 45;
          const logoHeight = 9;
          const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
          const logoY = margin.top - 15;
          doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
        }
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`  Adserving/Tech Fees: ${entry.adservingTechFees}`, margin.left + 5, y);
      y += lineHeight * 0.8;
    }

    if (entry.production) {
      if (y > maxY - lineHeight * 2) {
        doc.addPage();
        y = margin.top;
        if (logoBase64) {
          const logoWidth = 45;
          const logoHeight = 9;
          const logoX = doc.internal.pageSize.getWidth() - margin.right - logoWidth;
          const logoY = margin.top - 15;
          doc.addImage(logoBase64, 'PNG', logoX, logoY, logoWidth, logoHeight);
        }
      }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text(`  Production: ${entry.production}`, margin.left + 5, y);
      y += lineHeight * 0.8;
    }

    y += lineHeight * 0.5; // Space between months
  });

  // Return the generated PDF as a Blob
  return doc.output('blob');
}
