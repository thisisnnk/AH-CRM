import * as XLSX from "xlsx";

/**
 * Export an array of objects to an .xlsx file and trigger browser download.
 * @param rows       Array of plain objects (one per row)
 * @param fileName   Output file name WITHOUT extension (e.g. "leads-export")
 * @param sheetName  Optional sheet tab name
 */
export function exportToExcel(
  rows: Record<string, any>[],
  fileName: string,
  sheetName = "Sheet1"
): void {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, `${fileName}.xlsx`);
}
