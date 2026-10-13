export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false;
  const sep = (text.split('\n')[0].match(/;/g) ?? []).length > (text.split('\n')[0].match(/,/g) ?? []).length ? ';' : ',';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { row.push(cur); cur = ''; } else if (c === '\n') { row.push(cur.replace(/\r$/, '')); rows.push(row); row = []; cur = ''; } else cur += c;
  }
  if (cur || row.length) { row.push(cur.replace(/\r$/, '')); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim()));
}
