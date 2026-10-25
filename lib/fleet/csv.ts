/**
 * CSV helpers.
 *
 * - toCsv applies the CSV-injection guard: any cell starting with = + - @ (or tab / CR)
 *   is prefixed with a single quote so spreadsheet apps do not evaluate it as a formula.
 * - parseCsv handles quoted fields, embedded commas/quotes/newlines, CRLF line endings
 *   and a leading UTF-8 BOM.
 */

const INJECTION_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

function guardCell(value: string): string {
  if (value.length > 0 && INJECTION_PREFIXES.includes(value[0]!)) {
    return `'${value}`;
  }
  return value;
}

function escapeCell(value: unknown): string {
  const raw = value == null ? '' : String(value);
  const guarded = guardCell(raw);
  if (/[",\r\n]/.test(guarded)) {
    return `"${guarded.replace(/"/g, '""')}"`;
  }
  return guarded;
}

/** Serialise rows to CSV. `columns` controls order and headers (key => header label). */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns?: Array<{ key: keyof T; header: string }>
): string {
  const cols =
    columns ??
    (rows.length
      ? (Object.keys(rows[0]!) as Array<keyof T>).map((key) => ({ key, header: String(key) }))
      : []);

  const headerLine = cols.map((c) => escapeCell(c.header)).join(',');
  const dataLines = rows.map((row) => cols.map((c) => escapeCell(row[c.key])).join(','));
  return [headerLine, ...dataLines].join('\r\n');
}

/** Trigger a browser download of CSV text. */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Parse CSV text into an array of string-keyed records using the header row. */
export function parseCsv(input: string): Record<string, string>[] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\r') {
      // CRLF: let the \n handle the row break.
      if (text[i + 1] === '\n') continue;
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else if (char === '\n') {
      row.push(field);
      field = '';
      rows.push(row);
      row = [];
    } else {
      field += char;
    }
  }
  // Flush the final field/row if the file did not end with a newline.
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.length > 1 || (r.length === 1 && r[0]!.trim() !== ''));
  if (!nonEmpty.length) return [];

  const headers = nonEmpty[0]!.map((h) => h.trim());
  return nonEmpty.slice(1).map((cells) => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = cells[index] ?? '';
    });
    return record;
  });
}
