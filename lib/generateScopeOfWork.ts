// /lib/generateScopeOfWork.ts

import { jsPDF } from "jspdf";
import { readFileSync } from 'fs';
import { join } from 'path';

export interface ScopeOfWorkData {
  client_name: string;
  contact_name: string;
  contact_email: string;
  scope_date: string;
  scope_version: number;
  project_name: string;
  project_status: string;
  project_overview: string;
  deliverables: string;
  tasks_steps: string;
  timelines: string;
  responsibilities: string;
  requirements: string;
  assumptions: string;
  exclusions: string;
  cost: Array<{
    expense_category: string;
    description: string;
    cost: number;
  }>;
  payment_terms_and_conditions: string;
  billing_schedule?: Array<{
    month: string;
    cost: number;
  }>;
}

// Helper function to format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(amount);
};

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

// Helper to split text into lines that fit within page width
const splitText = (doc: jsPDF, text: string, maxWidth: number): string[] => {
  const lines = doc.splitTextToSize(text, maxWidth);
  return lines;
};

export async function generateScopeOfWork(scopeData: ScopeOfWorkData): Promise<Blob> {
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

  // Helper function to check if we need a new page
  const checkNewPage = () => {
    if (y > doc.internal.pageSize.getHeight() - margin.bottom - 20) {
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
  doc.setFontSize(11);
  doc.text("SCOPE OF WORK", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Date: ${scopeData.scope_date}`, margin.left, y);
  y += lineHeight;
  doc.text(`Version: ${scopeData.scope_version}`, margin.left, y);
  y += lineHeight * 2;

  // Client Information
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Client Information", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Client Name: ${scopeData.client_name}`, margin.left, y);
  y += lineHeight;
  doc.text(`Contact Name: ${scopeData.contact_name}`, margin.left, y);
  y += lineHeight;
  doc.text(`Contact Email: ${scopeData.contact_email}`, margin.left, y);
  y += lineHeight * 2;

  // Project Information
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Project Information", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`Project Name: ${scopeData.project_name}`, margin.left, y);
  y += lineHeight;
  doc.text(`Project Status: ${scopeData.project_status}`, margin.left, y);
  y += lineHeight * 2;

  // Project Overview
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Project Overview/Objectives", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const overviewLines = splitText(doc, scopeData.project_overview || "N/A", pageW);
  overviewLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight;

  // Deliverables
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Deliverables", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const deliverablesLines = splitText(doc, scopeData.deliverables || "N/A", pageW);
  deliverablesLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight;

  // Tasks/Steps
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Tasks/Steps", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const tasksLines = splitText(doc, scopeData.tasks_steps || "N/A", pageW);
  tasksLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight;

  // Timelines
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Timelines", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const timelinesLines = splitText(doc, scopeData.timelines || "N/A", pageW);
  timelinesLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight;

  // Responsibilities
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Responsibilities", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const responsibilitiesLines = splitText(doc, scopeData.responsibilities || "N/A", pageW);
  responsibilitiesLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight;

  // Requirements
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Requirements", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const requirementsLines = splitText(doc, scopeData.requirements || "N/A", pageW);
  requirementsLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight;

  // Assumptions
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Assumptions", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const assumptionsLines = splitText(doc, scopeData.assumptions || "N/A", pageW);
  assumptionsLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight;

  // Exclusions
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Exclusions", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const exclusionsLines = splitText(doc, scopeData.exclusions || "N/A", pageW);
  exclusionsLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight * 2;

  // Cost Table
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Cost Breakdown", margin.left, y);
  y += lineHeight * 1.5;

  // Table headers
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Expense Category", margin.left, y);
  doc.text("Description", margin.left + 50, y);
  doc.text("Cost", margin.left + pageW, y, { align: 'right' });
  y += 2;
  doc.setDrawColor(0);
  doc.line(margin.left, y, margin.left + pageW, y); // horizontal line
  y += lineHeight;

  // Table rows
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  let totalCost = 0;
  
  if (scopeData.cost && Array.isArray(scopeData.cost) && scopeData.cost.length > 0) {
    scopeData.cost.forEach((item) => {
      checkNewPage();
      const costValue = typeof item.cost === 'number' ? item.cost : parseFloat(String(item.cost)) || 0;
      totalCost += costValue;
      
      // Split category and description if they're too long
      const categoryLines = splitText(doc, item.expense_category || "", 45);
      const descLines = splitText(doc, item.description || "", 80);
      const maxLines = Math.max(categoryLines.length, descLines.length);
      
      for (let i = 0; i < maxLines; i++) {
        if (i > 0) {
          checkNewPage();
        }
        doc.text(categoryLines[i] || "", margin.left, y);
        doc.text(descLines[i] || "", margin.left + 50, y);
        if (i === 0) {
          doc.text(formatCurrency(costValue), margin.left + pageW, y, { align: 'right' });
        }
        y += lineHeight;
      }
    });
  } else {
    doc.text("No cost items", margin.left, y);
    y += lineHeight;
  }

  y += lineHeight;
  checkNewPage();

  // Total
  doc.setDrawColor(0);
  doc.line(margin.left, y, margin.left + pageW, y); // horizontal line
  y += lineHeight;
  doc.setFont("helvetica", "bold");
  doc.text("TOTAL (EX GST):", margin.left + (pageW / 2), y, { align: 'right' });
  doc.text(formatCurrency(totalCost), margin.left + pageW, y, { align: 'right' });
  y += lineHeight * 2;

  // Payment Terms and Conditions
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Payment Terms and Conditions", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const paymentLines = splitText(doc, scopeData.payment_terms_and_conditions || "N/A", pageW);
  paymentLines.forEach((line: string) => {
    checkNewPage();
    doc.text(line, margin.left, y);
    y += lineHeight;
  });
  y += lineHeight * 2;

  // Billing Schedule
  if (scopeData.billing_schedule && Array.isArray(scopeData.billing_schedule) && scopeData.billing_schedule.length > 0) {
    checkNewPage();
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("Billing Schedule", margin.left, y);
    y += lineHeight * 1.5;

    // Table headers
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Month", margin.left, y);
    doc.text("Cost", margin.left + pageW, y, { align: 'right' });
    y += 2;
    doc.setDrawColor(0);
    doc.line(margin.left, y, margin.left + pageW, y); // horizontal line
    y += lineHeight;

    // Table rows
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    
    scopeData.billing_schedule.forEach((item) => {
      checkNewPage();
      const costValue = typeof item.cost === 'number' ? item.cost : parseFloat(String(item.cost)) || 0;
      
      // Format month display
      let monthDisplay = item.month || "";
      if (monthDisplay.match(/^\d{4}-\d{2}$/)) {
        // Format YYYY-MM to "Month Year"
        const [year, month] = monthDisplay.split('-').map(Number);
        const date = new Date(year, month - 1, 1);
        const monthName = date.toLocaleString('en-US', { month: 'long' });
        monthDisplay = `${monthName} ${year}`;
      }
      
      doc.text(monthDisplay, margin.left, y);
      doc.text(formatCurrency(costValue), margin.left + pageW, y, { align: 'right' });
      y += lineHeight;
    });

    y += lineHeight;
  }

  // Client Approval
  checkNewPage();
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("Client Approval", margin.left, y);
  y += lineHeight * 1.5;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  ['Name:', 'Position:', 'Signature:', 'Date:'].forEach(label => {
    checkNewPage();
    doc.text(label, margin.left, y);
    doc.line(margin.left + 25, y, margin.left + pageW, y); // signature line
    y += lineHeight * 2;
  });

  // Return the generated PDF as a Blob.
  return doc.output('blob');
}




