/**
 * Utility functions for CSV export functionality
 */

/**
 * Converts an array of objects to CSV format
 * @param data Array of objects to convert to CSV
 * @param headers Optional custom headers mapping (key: display name)
 * @returns CSV string
 */
export function convertToCSV<T extends Record<string, any>>(
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
    return allKeys.map(key => {
      const value = item[key];
      
      // Handle different data types
      if (value === null || value === undefined) {
        return '';
      } else if (typeof value === 'string') {
        // Escape quotes and wrap in quotes if contains comma, newline, or quote
        const escaped = value.replace(/"/g, '""');
        return /[,\n"]/.test(value) ? `"${escaped}"` : escaped;
      } else if (typeof value === 'object') {
        // Convert objects to JSON string
        return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
      } else {
        // Numbers, booleans, etc.
        return value;
      }
    }).join(',');
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
  const csv = convertToCSV(data, headers);
  
  // Create a blob with the CSV data
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  
  // Create a link element
  const link = document.createElement('a');
  
  // Create a URL for the blob
  const url = URL.createObjectURL(blob);
  
  // Set link properties
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  // Append to document, click, and remove
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
} 