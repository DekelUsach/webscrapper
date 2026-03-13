import * as XLSX from "xlsx";

/**
 * Column metadata: maps raw data keys → human-readable headers + min widths.
 * Extend here if new fields are added to the API response.
 */
const COLUMN_META: Record<string, { label: string; width: number }> = {
  expositor: { label: "Expositor",  width: 40 },
  email:     { label: "Email",      width: 38 },
  stand:     { label: "Stand",      width: 16 },
  website:   { label: "Sitio Web",  width: 38 },
};

export function downloadCSV(data: any[], filename: string) {
  if (!data || data.length === 0) return;

  // ── 1. Resolve column order: known columns first, then any extra keys ──
  const knownKeys = Object.keys(COLUMN_META);
  const dataKeys  = Object.keys(data[0]);
  const orderedKeys = [
    ...knownKeys.filter((k) => dataKeys.includes(k)),
    ...dataKeys.filter((k) => !knownKeys.includes(k)),
  ];

  // ── 2. Build header row (human-readable labels) ──
  const headerRow = orderedKeys.map(
    (k) => COLUMN_META[k]?.label ?? k.charAt(0).toUpperCase() + k.slice(1)
  );

  // ── 3. Build data rows ──
  const dataRows = data.map((item) =>
    orderedKeys.map((k) => item[k] ?? "")
  );

  // ── 4. Assemble worksheet ──
  const wsData = [headerRow, ...dataRows];
  const ws     = XLSX.utils.aoa_to_sheet(wsData);

  // ── 5. Column widths ──
  ws["!cols"] = orderedKeys.map((k) => ({
    wch: COLUMN_META[k]?.width ?? 24,
  }));

  // ── 6. Style: bold + fill on header row ──
  //    SheetJS Community Edition supports basic cell metadata via the cell object.
  //    Full rich styles (fill/font/border) require the Pro build or a companion
  //    library like xlsx-js-style. Here we use xlsx-js-style-compatible syntax
  //    that degrades gracefully with the OSS build (columns + bold still apply).
  const totalCols = orderedKeys.length;
  const totalRows = wsData.length;

  for (let C = 0; C < totalCols; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font:      { bold: true, color: { rgb: "FFFFFF" }, sz: 11 },
      fill:      { fgColor: { rgb: "0A84FF" } },          // Apple Blue header
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      border: {
        top:    { style: "thin", color: { rgb: "38383A" } },
        bottom: { style: "thin", color: { rgb: "38383A" } },
        left:   { style: "thin", color: { rgb: "38383A" } },
        right:  { style: "thin", color: { rgb: "38383A" } },
      },
    };
  }

  // Style data rows: alternating fill + border
  for (let R = 1; R < totalRows; R++) {
    const isEven = R % 2 === 0;
    for (let C = 0; C < totalCols; C++) {
      const cellAddr = XLSX.utils.encode_cell({ r: R, c: C });
      if (!ws[cellAddr]) {
        // Ensure empty cells still get borders
        ws[cellAddr] = { t: "s", v: "" };
      }
      ws[cellAddr].s = {
        font:      { sz: 10, color: { rgb: "E5E5EA" } },
        fill:      { fgColor: { rgb: isEven ? "1C1C1E" : "2C2C2E" } },
        alignment: { vertical: "center", wrapText: false },
        border: {
          top:    { style: "thin", color: { rgb: "38383A" } },
          bottom: { style: "thin", color: { rgb: "38383A" } },
          left:   { style: "thin", color: { rgb: "38383A" } },
          right:  { style: "thin", color: { rgb: "38383A" } },
        },
      };
    }
  }

  // ── 7. Row height: header taller ──
  ws["!rows"] = [
    { hpt: 22 }, // header
    ...Array(dataRows.length).fill({ hpt: 18 }),
  ];

  // ── 8. Freeze top row ──
  ws["!freeze"] = { xSplit: 0, ySplit: 1, topLeftCell: "A2" };

  // ── 9. Workbook + sheet name ──
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Expositores");

  // ── 10. Trigger download (binary string → Blob) ──
  const xlsxFilename = filename.replace(/\.csv$/i, ".xlsx");
  XLSX.writeFile(wb, xlsxFilename, { bookType: "xlsx", type: "binary", cellStyles: true });
}
