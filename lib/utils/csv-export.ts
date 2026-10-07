/**
 * Utility functions for CSV export functionality
 */

/**
 * Converts an array of objects to CSV format
 * @param data Array of objects to convert to CSV
 * @param headers Optional custom headers mapping (key: display name)
 * @returns CSV string
 */
function convertToCSV<T extends Record<string, any>>(
  data: T[],
  headers?: Record<string, string>
): string {
  if (data.length === 0) return '';

  // Get all unique keys from all objects
  const allKeys = Array.from(
    new Set(data.flatMap(item => Object.keys(item)))
  );

  // Create header row
  const headerRow = allKeys.map(key => 
    headers && headers[key] ? headers[key] : key
  ).join(',');

  // Create data rows
  const rows = data.map(item => {
    return allKeys.map(key => formatCsvField(item[key])).join(',');
  });

  // Combine header and data rows
  return [headerRow, ...rows].join('\n');
}

/**
 * Downloads data as a CSV file
 * @param data Array of objects to download as CSV
 * @param filename Name of the file (without extension)
 * @param headers Optional custom headers mapping (key: display name)
 */
export function downloadCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  headers?: Record<string, string>
): void {
  downloadCsvText(convertToCSV(data, headers), filename);
}

/**
 * Downloads a rectangular CSV. The first row is the header row.
 * Cell escaping matches convertToCSV (quotes, commas, newlines).
 */
export function downloadCsvRows(
  rows: Array<Array<string | number | null | undefined>>,
  filename: string
): void {
  const csv = rows.map(row => row.map(cell => formatCsvField(cell)).join(',')).join('\n');
  downloadCsvText(csv, filename);
}

function formatCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  } else if (typeof value === 'string') {
    const escaped = value.replace(/"/g, '""');
    return /[,\n"]/.test(value) ? `"${escaped}"` : escaped;
  } else if (typeof value === 'object') {
    return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
  }
  return String(value);
}

function downloadCsvText(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
} 