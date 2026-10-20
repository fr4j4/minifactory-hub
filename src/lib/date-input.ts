/** dd-mm-aaaa → aaaa-mm-dd (o '' si no es una fecha real). */
export function parseDisplay(v: string): string {
  const m = v.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); if (!m) return '';
  const [d, mo, y] = [+m[1], +m[2], +m[3]]; const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '';
}
