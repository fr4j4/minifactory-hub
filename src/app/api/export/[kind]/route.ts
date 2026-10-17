import { NextResponse } from 'next/server';
import { and, desc, gte, isNull, lt } from 'drizzle-orm';
import ExcelJS from 'exceljs';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can, type Module } from '@/lib/perm';
import { reportAllowed, reportData } from '@/lib/reports';
import { getT } from '@/i18n/server';
import { csvCell } from '@/lib/csv';

/** Exportaciones: clientes (CSV) y reportes (CSV / XLSX). */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const t = await getT();
  const user = await getSession(); if (!user) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { kind } = await params; const url = new URL(req.url); const fmt = url.searchParams.get('fmt') ?? 'csv';
  const db = await getDb();
  let header: string[] = [], rows: unknown[][] = [], name = kind;
  // 'clientes' es también un reporte: la libreta de contactos usa su propio nombre para no saltarse el filtro del reporte
  if (kind === 'clientes-lista') {
    if (!can(user, 'clientes', 'V')) return NextResponse.json({ error: t('api.noPermission') }, { status: 403 });
    const cs = await db.select().from(s.customers).where(isNull(s.customers.deletedAt));
    header = ['nombre', 'telefono', 'email', 'rut', 'tipo', 'etiquetas', 'consentimiento_fotos']; rows = cs.map((c) => [c.name, c.phone, c.email, c.taxId, c.type, (c.tags ?? []).join(';'), c.photoConsent]); name = 'clientes';
  } else if (reportAllowed(user, kind)) {
    if (!can(user, 'reportes', 'V')) return NextResponse.json({ error: t('api.noPermission') }, { status: 403 });
    const from = url.searchParams.get('from') ? new Date(url.searchParams.get('from')!) : new Date(Date.now() - 30 * 86400_000); const to = url.searchParams.get('to') ? new Date(url.searchParams.get('to')! + 'T23:59:59') : new Date();
    const d = await reportData(kind, { from, to }, user); header = d.columns.map((c) => c.label); rows = d.rows.map((r) => d.columns.map((c) => r[c.key])); name = `reporte-${kind}`;
  } else return NextResponse.json({ error: t('api.unknownExport') }, { status: 404 });
  if (fmt === 'xlsx') {
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet(name.slice(0, 30)); ws.addRow(header).font = { bold: true }; rows.forEach((r) => ws.addRow(r as any[])); ws.columns.forEach((c) => { c.width = 18; });
    const buf = await wb.xlsx.writeBuffer();
    return new Response(buf as ArrayBuffer, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'content-disposition': `attachment; filename="${name}.xlsx"` } });
  }
  const csv = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
  return new Response(csv, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="${name}.csv"` } });
}
