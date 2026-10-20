import fs from 'node:fs';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { hashPassword } from './auth';
import { getRates, getSettings, saveSettings } from './settings';
import { ensureSetupToken } from './setup';
import { createSpool, seedSuppliers } from './services/inventory';
import { ingestModel } from './files';
import { orcaAvailable, findVendorOf, getIndex } from './slicer/catalog';
import { calcLine } from './pricing';
import { createOrder } from './services/orders';
import { saveProduct } from './services/catalog';
import { saveQuote } from './services/quotes';
import { machineCostOf } from './services/quotes';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Primer arranque: taller, administrador, canales de venta y listas de precios. Idempotente. */
export async function bootstrap(opts: { adminEmail?: string; adminPassword?: string; shopName?: string; quietToken?: boolean } = {}) {
  const db = await getDb();
  const [ws] = await db.select().from(s.workspaces).where(eq(s.workspaces.id, WORKSPACE_ID));
  if (!ws) await db.insert(s.workspaces).values({ id: WORKSPACE_ID, name: opts.shopName ?? 'MiniFactory' });
  const [u] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  if (!u) {
    // Sin contraseña definida no se crea ninguna cuenta: el asistente inicial (/bienvenida) la pide con un token de un solo uso.
    const pw = opts.adminPassword ?? process.env.ADMIN_PASSWORD;
    if (pw) await db.insert(s.users).values({ workspaceId: WORKSPACE_ID, email: (opts.adminEmail ?? process.env.ADMIN_EMAIL ?? 'admin@minifactory.cl').toLowerCase(), name: 'Administrador', role: 'admin', passwordHash: await hashPassword(pw) });
    else await ensureSetupToken(!opts.quietToken);
  }
  const [ch] = await db.select({ id: s.salesChannels.id }).from(s.salesChannels).limit(1);
  if (!ch) {
    await db.insert(s.salesChannels).values([
      { workspaceId: WORKSPACE_ID, name: 'Taller / presencial', kind: 'directo' },
      { workspaceId: WORKSPACE_ID, name: 'WhatsApp', kind: 'directo' },
      { workspaceId: WORKSPACE_ID, name: 'Instagram', kind: 'redes' },
      { workspaceId: WORKSPACE_ID, name: 'Mercado Libre', kind: 'marketplace', commissionPct: 12, commissionFixed: 700, avgShipping: 2500 },
      { workspaceId: WORKSPACE_ID, name: 'Feria', kind: 'feria' },
    ]);
  }
  const [pl] = await db.select({ id: s.priceLists.id }).from(s.priceLists).limit(1);
  if (!pl) await db.insert(s.priceLists).values([
    { workspaceId: WORKSPACE_ID, name: 'Público', adjustPct: 0 }, { workspaceId: WORKSPACE_ID, name: 'Revendedor', adjustPct: -15 }, { workspaceId: WORKSPACE_ID, name: 'Empresa', adjustPct: -8 },
  ]);
  await seedSuppliers(db);
  const st = await getSettings();
  await saveSettings({ shop: { ...st.shop, name: opts.shopName ?? st.shop.name } });
}

/* generador pseudoaleatorio determinista para datos de demostración */
function rng(seed: number) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }
const daysAgo = (n: number, h = 12) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d; };
const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function seedDemo(opts: { users?: boolean } = {}) {
  const withUsers = opts.users !== false;
  await bootstrap({ adminPassword: process.env.ADMIN_PASSWORD ?? 'admin1234' });
  const db = await getDb();
  const [existing] = await db.select({ id: s.machines.id }).from(s.machines).limit(1);
  if (existing) return { skipped: true };
  const pw = await hashPassword('taller1234');
  const [admin] = await db.select().from(s.users).limit(1);
  if (withUsers) await db.update(s.users).set({ name: 'Francisco (Admin)' }).where(eq(s.users.id, admin.id));
  const [op] = withUsers ? await db.insert(s.users).values({ workspaceId: WORKSPACE_ID, email: 'operador@minifactory.cl', name: 'Camila (Operadora)', role: 'operador', passwordHash: pw }).returning() : [];
  const [ve] = withUsers ? await db.insert(s.users).values({ workspaceId: WORKSPACE_ID, email: 'ventas@minifactory.cl', name: 'Diego (Ventas)', role: 'ventas', passwordHash: pw }).returning() : [];
  const adminUser = { id: admin.id, role: 'admin' as const };

  /* ── perfiles del laminador (base = perfiles de fábrica de OrcaSlicer) ── */
  const prof: Record<string, string> = {};
  if (orcaAvailable()) {
    const mk = async (key: string, type: 'machine' | 'process' | 'filament', name: string, baseName: string, changes: Record<string, any> = {}, simulated = false) => {
      const vendor = findVendorOf(type, baseName);
      if (!vendor) return;
      const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type, name, vendor, baseName, changes, simulated, createdBy: admin.id }).returning({ id: s.slicerProfiles.id });
      await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName, changes, note: 'Versión inicial' });
      prof[key] = r.id;
    };
    await mk('mA1', 'machine', 'Bambu Lab A1 0.4', 'Bambu Lab A1 0.4 nozzle');
    await mk('mEnder', 'machine', 'Ender-3 V3 SE 0.4', 'Creality Ender-3 V3 SE 0.4 nozzle');
    await mk('mMK4S', 'machine', 'Prusa MK4S 0.4 (simulada)', 'Prusa MK4S 0.4 nozzle', {}, true);
    await mk('pStd', 'process', 'A1 · 0,20 Standard', '0.20mm Standard @BBL A1');
    await mk('pFine', 'process', 'A1 · 0,12 Fine', '0.12mm Fine @BBL A1');
    await mk('pDraft', 'process', 'A1 · 0,28 Extra Draft', '0.28mm Extra Draft @BBL A1');
    await mk('pStrong', 'process', 'A1 · 0,20 relleno 40% giroide', '0.20mm Standard @BBL A1', { sparse_infill_density: '40%', sparse_infill_pattern: 'gyroid', wall_loops: '4' });
    await mk('pSlow', 'process', 'A1 lenta (piezas técnicas)', '0.20mm Standard @BBL A1', { default_acceleration: '2000', outer_wall_speed: '60', inner_wall_speed: '80', sparse_infill_speed: '100' });
    await mk('pEnder', 'process', 'Ender · 0,20 Standard', '0.20mm Standard @Creality Ender3V3SE 0.4');
    await mk('pMK4S', 'process', 'MK4S · 0,20 SPEED', '0.20mm SPEED @MK4S 0.4');
    await mk('fPLA', 'filament', 'PLA Basic', 'Bambu PLA Basic @BBL A1');
    await mk('fPETG', 'filament', 'PETG Basic', 'Bambu PETG Basic @BBL A1');
    await mk('fPETGslow', 'filament', 'PETG lento piezas técnicas', 'Bambu PETG Basic @BBL A1', { nozzle_temperature: '250', filament_max_volumetric_speed: '8' });
    await mk('fTPU', 'filament', 'TPU 95A', 'Bambu TPU 95A @BBL A1');
    await mk('fEnderPLA', 'filament', 'PLA genérico Ender', 'Creality Generic PLA @Ender-3V3-all');
  }

  /* ── máquinas ── */
  const machineRows = await db.insert(s.machines).values([
    { workspaceId: WORKSPACE_ID, name: 'Bambu A1 #1', brand: 'Bambu Lab', model: 'A1', tech: 'FDM', volX: 256, volY: 256, volZ: 256, nozzles: ['0.4', '0.6'], materialsOk: ['PLA', 'PETG', 'TPU'], multicolorSlots: 4, purchaseValue: 480000, residualValue: 100000, lifeHours: 5000, watts: 130, maintCostHour: 150, feedGph: 28, machineProfileId: prof.mA1 ?? null, defaultProcessProfileId: prof.pStd ?? null, hoursTotal: 412 },
    { workspaceId: WORKSPACE_ID, name: 'Ender-3 V3 SE', brand: 'Creality', model: 'Ender-3 V3 SE', tech: 'FDM', volX: 220, volY: 220, volZ: 250, materialsOk: ['PLA', 'PETG'], purchaseValue: 180000, residualValue: 30000, lifeHours: 4000, watts: 120, maintCostHour: 100, feedGph: 18, machineProfileId: prof.mEnder ?? null, defaultProcessProfileId: prof.pEnder ?? null, hoursTotal: 187 },
    { workspaceId: WORKSPACE_ID, name: 'Prusa MK4S (simulada)', brand: 'Prusa', model: 'MK4S', tech: 'FDM', volX: 250, volY: 210, volZ: 220, materialsOk: ['PLA', 'PETG', 'ASA'], purchaseValue: 1000000, residualValue: 250000, lifeHours: 8000, watts: 140, maintCostHour: 120, feedGph: 30, simulated: true, machineProfileId: prof.mMK4S ?? null, defaultProcessProfileId: prof.pMK4S ?? null },
    { workspaceId: WORKSPACE_ID, name: 'Elegoo Saturn 3 (resina)', brand: 'Elegoo', model: 'Saturn 3', tech: 'SLA', volX: 218, volY: 123, volZ: 250, materialsOk: ['resina'], purchaseValue: 260000, residualValue: 50000, lifeHours: 3000, watts: 60, maintCostHour: 200, feedGph: 40, hoursTotal: 36 },
  ]).returning();
  const [a1, ender, mk4s, saturn] = machineRows;
  await db.insert(s.maintenancePlans).values([
    { workspaceId: WORKSPACE_ID, machineId: a1.id, task: 'Lubricar ejes', intervalHours: 200, lastDoneHours: 230 },
    { workspaceId: WORKSPACE_ID, machineId: a1.id, task: 'Cambiar boquilla', intervalHours: 500, lastDoneHours: 0 },
    { workspaceId: WORKSPACE_ID, machineId: ender.id, task: 'Nivelar cama y revisar correas', intervalHours: 100, lastDoneHours: 120 },
    { workspaceId: WORKSPACE_ID, machineId: saturn.id, task: 'Limpiar y revisar FEP', intervalDays: 30, lastDoneAt: ymd(daysAgo(12)) },
  ]);

  /* ── materiales y bobinas ── */
  const M = await db.insert(s.materials).values([
    { workspaceId: WORKSPACE_ID, manufacturer: 'Bambu Lab', line: 'PLA Basic', type: 'PLA', colorName: 'Negro', hex: '#1c1c1c', density: 1.24, costPerKg: 17000, stockMinG: 1500, tempNozzle: '190–230', tempBed: '35–45', supplierText: 'Bambu Lab Store' },
    { workspaceId: WORKSPACE_ID, manufacturer: 'Bambu Lab', line: 'PLA Basic', type: 'PLA', colorName: 'Blanco', hex: '#f1f1ee', density: 1.24, costPerKg: 17000, stockMinG: 1000, supplierText: 'Bambu Lab Store' },
    { workspaceId: WORKSPACE_ID, manufacturer: 'Grilon3', line: 'PLA', type: 'PLA', colorName: 'Rojo', hex: '#d62f2f', density: 1.24, costPerKg: 15000, stockMinG: 1000, supplierText: 'Distribuidor local' },
    { workspaceId: WORKSPACE_ID, manufacturer: 'Grilon3', line: 'PLA', type: 'PLA', colorName: 'Azul', hex: '#2d6cdf', density: 1.24, costPerKg: 15000, stockMinG: 1000, supplierText: 'Distribuidor local' },
    { workspaceId: WORKSPACE_ID, manufacturer: 'Bambu Lab', line: 'PETG Basic', type: 'PETG', colorName: 'Negro', hex: '#222222', density: 1.27, costPerKg: 19000, stockMinG: 1000, tempNozzle: '230–260', tempBed: '70–80', supplierText: 'Bambu Lab Store' },
    { workspaceId: WORKSPACE_ID, manufacturer: 'eSun', line: 'PETG', type: 'PETG', colorName: 'Transparente', hex: '#cfe6ee', density: 1.27, costPerKg: 19000, stockMinG: 1000, supplierText: 'eSun' },
    { workspaceId: WORKSPACE_ID, manufacturer: 'Sunlu', line: 'TPU 95A', type: 'TPU', colorName: 'Negro', hex: '#2b2b2b', density: 1.21, costPerKg: 26000, stockMinG: 500, supplierText: 'Sunlu' },
    { workspaceId: WORKSPACE_ID, tech: 'resina', manufacturer: 'Elegoo', line: 'Standard', type: 'Resina estándar', colorName: 'Gris', hex: '#9aa0a6', density: 1.1, diameter: null, costPerKg: 28000, stockMinG: 500, supplierText: 'Elegoo' },
  ]).returning();
  const [plaNeg, plaBla, plaRoj, plaAzu, petgNeg, petgTra, tpu, resina] = M;
  { const { syncMaterialLine } = await import('./services/lines'); for (const m of M) await syncMaterialLine(m.id, db); }
  { const { setMaterialProfile } = await import('./slicer/links'); for (const [m, k] of [[plaNeg, 'fPLA'], [plaBla, 'fPLA'], [plaRoj, 'fPLA'], [plaAzu, 'fPLA'], [petgNeg, 'fPETG'], [petgTra, 'fPETG'], [tpu, 'fTPU']] as const) if (prof[k]) await setMaterialProfile(m.id, prof[k], null, db); }
  const sp = async (m: typeof plaNeg, g: number, extra: Record<string, any> = {}) => { const x = await createSpool({ materialId: m.id, initialG: 1000, unitCost: m.costPerKg, userId: admin.id }); await db.update(s.spools).set({ remainingG: g, ...extra }).where(eq(s.spools.id, x.id)); return x; };
  const spA = await sp(plaNeg, 640, { status: 'en_uso', machineId: a1.id, slot: 'Carrete directo', location: 'Cargada en Bambu A1 #1' });
  await sp(plaNeg, 1000, { location: 'Estante A1' }); await sp(plaNeg, 880, { status: 'abierta', location: 'Caja seca', lastDriedAt: ymd(daysAgo(10)) });
  await sp(plaBla, 720, { status: 'en_uso', machineId: ender.id, location: 'Cargada en Ender-3' }); await sp(plaBla, 1000, { location: 'Estante A2' });
  await sp(plaRoj, 410, { status: 'abierta', location: 'Estante B1' }); await sp(plaAzu, 1000, { location: 'Estante B2' });
  await sp(petgNeg, 530, { status: 'abierta', location: 'Caja seca' }); await sp(petgNeg, 1000, { location: 'Estante C1' });
  await sp(petgTra, 260, { status: 'abierta', location: 'Estante C2' }); await sp(tpu, 700, { status: 'abierta', location: 'Caja seca' });
  await sp(resina, 650, { status: 'abierta', location: 'Mesa de resina' });
  await db.insert(s.inventoryItems).values([
    { workspaceId: WORKSPACE_ID, category: 'repuesto', sku: 'BOQ-04', name: 'Boquilla 0.4 mm', unit: 'un', stock: 4, minStock: 2, unitCost: 3500, supplierText: 'Bambu Lab Store' },
    { workspaceId: WORKSPACE_ID, category: 'repuesto', sku: 'PTFE-1', name: 'Tubo PTFE 1 m', unit: 'un', stock: 2, minStock: 2, unitCost: 2500 },
    { workspaceId: WORKSPACE_ID, category: 'repuesto', sku: 'PEI-256', name: 'Cama PEI texturizada 256 mm', unit: 'un', stock: 1, minStock: 1, unitCost: 22000 },
    { workspaceId: WORKSPACE_ID, category: 'repuesto', sku: 'FEP-S3', name: 'Film FEP Saturn 3', unit: 'un', stock: 3, minStock: 1, unitCost: 6000 },
    { workspaceId: WORKSPACE_ID, category: 'insumo', sku: 'IPA-1L', name: 'Alcohol isopropílico', unit: 'L', stock: 2.5, minStock: 1, unitCost: 6500 },
    { workspaceId: WORKSPACE_ID, category: 'insumo', sku: 'LIJA-400', name: 'Lija al agua 400', unit: 'un', stock: 18, minStock: 10, unitCost: 450 },
    { workspaceId: WORKSPACE_ID, category: 'insumo', sku: 'INS-M3', name: 'Inserto roscado M3', unit: 'un', stock: 120, minStock: 50, unitCost: 90 },
    { workspaceId: WORKSPACE_ID, category: 'insumo', sku: 'IMAN-8', name: 'Imán 8×2 mm', unit: 'un', stock: 40, minStock: 50, unitCost: 120 },
    { workspaceId: WORKSPACE_ID, category: 'embalaje', sku: 'CAJA-15', name: 'Caja 15×15×10 cm', unit: 'un', stock: 30, minStock: 20, unitCost: 600 },
    { workspaceId: WORKSPACE_ID, category: 'embalaje', sku: 'BURB-1', name: 'Plástico burbuja (m)', unit: 'm', stock: 12, minStock: 5, unitCost: 800 },
  ]);

  /* ── archivos 3D de ejemplo ── */
  const samples = path.join(process.cwd(), 'samples');
  const fileIds: Record<string, { modelFileId: string; versionId: string }> = {};
  if (fs.existsSync(samples)) {
    for (const [f, nice, tags, origin] of [['barquito.stl', 'Barquito decorativo', ['decoración', 'barco'], 'Propio'], ['engranaje.stl', 'Engranaje 16 dientes', ['mecánico'], 'Propio'], ['llavero.stl', 'Llavero placa con orificio', ['llavero', 'regalo'], 'Cliente'], ['pieza-grande.stl', 'Placa grande 300 mm', ['prueba'], 'Propio']] as const) {
      const tmp = path.join(process.cwd(), 'data', 'tmp-' + f); fs.mkdirSync(path.dirname(tmp), { recursive: true }); fs.copyFileSync(path.join(samples, f), tmp);
      const r = await ingestModel({ tmpPath: tmp, filename: f, userId: admin.id, tags: [...tags], origin, sync: true });
      await db.update(s.modelFiles).set({ name: nice }).where(eq(s.modelFiles.id, r.modelFileId));
      fileIds[f.replace('.stl', '')] = { modelFileId: r.modelFileId, versionId: r.versionId };
    }
  }

  /* ── clientes ── */
  const [plPub, plRev, plEmp] = await db.select().from(s.priceLists).orderBy(s.priceLists.createdAt);
  const C = await db.insert(s.customers).values([
    { workspaceId: WORKSPACE_ID, name: 'Constanza Rojas', type: 'particular', phone: '+56 9 8123 4567', email: 'constanza@example.cl', photoConsent: 'yes', tags: ['maker'], priceListId: plPub?.id },
    { workspaceId: WORKSPACE_ID, name: 'Taller Mecánico Los Aromos SpA', type: 'empresa', phone: '+56 2 2345 6789', taxId: '76.123.456-0', email: 'compras@losaromos.cl', photoConsent: 'no_brand', tags: ['empresa', 'repuestos'], priceListId: plEmp?.id, depositPct: 50 },
    { workspaceId: WORKSPACE_ID, name: 'FabLab Universidad Austral', type: 'empresa', phone: '+56 63 222 0000', email: 'fablab@uach.example', photoConsent: 'yes', tags: ['universidad'], priceListId: plEmp?.id },
    { workspaceId: WORKSPACE_ID, name: 'Tienda Geek Chile', type: 'revendedor', phone: '+56 9 7000 1111', email: 'ventas@tiendageek.example', photoConsent: 'yes', tags: ['revendedor'], priceListId: plRev?.id },
    { workspaceId: WORKSPACE_ID, name: 'Andrea Valdés', type: 'particular', phone: '+56 9 6555 2222', photoConsent: 'no', priceListId: plPub?.id },
    { workspaceId: WORKSPACE_ID, name: 'Pedro (feria)', type: 'particular', isOccasional: true, phone: '+56 9 5000 9999', photoConsent: 'unknown' },
  ]).returning();
  const [cCon, cAro, cFab, cGeek, cAnd, cPed] = C;

  /* ── catálogo ── */
  const rt = await getRates();
  const costOf = (g: number, h: number, m: typeof plaNeg) => calcLine({ qty: 1, gramsTotal: g, hoursTotal: h, costPerKg: m.costPerKg, machine: machineCostOf(a1), prepMinutes: 0 }, rt).cost;
  const prods: Array<{ name: string; p: Parameters<typeof saveProduct>[0] }> = [
    { name: 'llavero', p: { name: 'Llavero personalizado', category: 'Accesorios', mode: 'variantes', attributes: [{ name: 'Color', values: ['Negro', 'Rojo', 'Blanco'] }, { name: 'Tamaño', values: ['S', 'M'] }], price: 3990, materialId: plaNeg.id, weightG: 7, printH: 0.5, minStock: 5, modelFileId: fileIds.llavero?.modelFileId, tags: ['regalo'] } },
    { name: 'soporte', p: { name: 'Soporte de audífonos', category: 'Hogar', mode: 'simple', price: 9990, materialId: plaNeg.id, weightG: 55, printH: 3.2, minStock: 3 } },
    { name: 'engranaje', p: { name: 'Engranaje 16 dientes', category: 'Repuestos', mode: 'simple', price: 5990, materialId: petgNeg.id, weightG: 18, printH: 1.1, minStock: 4, modelFileId: fileIds.engranaje?.modelFileId } },
    { name: 'barquito', p: { name: 'Barquito decorativo', category: 'Decoración', mode: 'variantes', attributes: [{ name: 'Color', values: ['Rojo', 'Azul'] }], price: 7990, materialId: plaRoj.id, weightG: 38, printH: 2.1, minStock: 2, modelFileId: fileIds.barquito?.modelFileId } },
  ];
  const stockPlan: Record<string, number[]> = { llavero: [12, 4, 9, 0, 6, 15], soporte: [8], engranaje: [3], barquito: [4, 1] };
  const prodIds: Record<string, string> = {};
  for (const x of prods) {
    const id = await saveProduct(x.p, { ...adminUser, permOverrides: {} });
    prodIds[x.name] = id;
    const vars = await db.select().from(s.productVariants).where(eq(s.productVariants.productId, id)).orderBy(s.productVariants.sku);
    for (let i = 0; i < vars.length; i++) {
      const v = vars[i]; const big = v.attrs?.['Tamaño'] === 'M';
      const g = x.p.weightG! * (big ? 1.4 : 1), h = x.p.printH! * (big ? 1.35 : 1);
      await db.update(s.productVariants).set({ weightG: g, printH: h, price: big ? Math.round(x.p.price! * 1.25 / 10) * 10 : x.p.price!, avgCost: Math.round(costOf(g, h, plaNeg)), stock: (stockPlan[x.name] ?? [5])[i] ?? 5 }).where(eq(s.productVariants.id, v.id));
    }
  }

  /* ── historial de demostración (pedidos, ventas, presupuestos) ── */
  const R = rng(20261013);
  const channels = await db.select().from(s.salesChannels);
  const variants = await db.select().from(s.productVariants);
  const sources = ['whatsapp', 'whatsapp', 'instagram', 'presencial', 'feria', 'recomendacion'];
  const custs = [cCon, cAro, cFab, cGeek, cAnd];
  const mats = [plaNeg, plaBla, plaRoj, plaAzu, petgNeg];
  const titles = ['Soporte para cámara', 'Carcasa Raspberry Pi', 'Figura cosplay', 'Repuesto de impresora', 'Maqueta arquitectura', 'Piezas de prototipo', 'Cubre-perilla', 'Organizador de escritorio', 'Gancho de pared', 'Adaptador de manguera'];
  for (let i = 0; i < 26; i++) {
    const age = 74 - i * 2.8 - Math.floor(R() * 2);
    const c = custs[Math.floor(R() * custs.length)]; const m = mats[Math.floor(R() * mats.length)]; const mach = R() > 0.35 ? a1 : ender;
    const qty = [1, 1, 2, 3, 5, 10][Math.floor(R() * 6)];
    const gUnit = 15 + Math.floor(R() * 110), hUnit = +(0.6 + R() * 5).toFixed(1);
    const id = await createOrder({
      customerId: c.id, customerName: c.name, customerPhone: c.phone, source: sources[Math.floor(R() * sources.length)], title: titles[i % titles.length],
      items: [{ description: titles[i % titles.length], qty, materialId: m.id, machineId: mach.id, gramsTotal: gUnit * qty, hoursTotal: hUnit * qty * 0.9, mode: 'manual', origin: { grams: 'manual', hours: 'manual' }, finalUnit: null }],
    }, { ...adminUser, permOverrides: {} });
    const [o] = await db.select().from(s.orders).where(eq(s.orders.id, id));
    const delivered = age > 8;
    const created = daysAgo(age);
    // ajuste de precio final: el usuario decidió +/- respecto del sugerido
    const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, id));
    let total = 0; let cost = 0;
    for (const it of items) { const f = Math.round(it.suggestedUnit * (0.85 + R() * 0.35) / 10) * 10; await db.update(s.orderItems).set({ finalUnit: f }).where(eq(s.orderItems.id, it.id)); total += f * it.qty; cost += it.costUnit * it.qty; }
    const status = delivered ? 'entregado' : i % 3 === 0 ? 'en_produccion' : i % 3 === 1 ? 'recibido' : 'listo';
    await db.update(s.orders).set({ total, status, createdAt: created, updatedAt: created, deliveredAt: delivered ? daysAgo(age - 3) : null, paid: delivered ? total : Math.round(total * 0.5), dueDate: ymd(daysAgo(age - 5)), costReal: delivered ? Math.round(cost * (0.9 + R() * 0.3)) : null }).where(eq(s.orders.id, id));
    if (delivered || R() > 0.4) await db.insert(s.payments).values({ workspaceId: WORKSPACE_ID, orderId: id, amount: delivered ? total : Math.round(total * 0.5), method: ['transferencia', 'efectivo', 'tarjeta'][Math.floor(R() * 3)], paidAt: ymd(daysAgo(age - 1)), createdAt: created });
    if (delivered) {
      const [job] = await db.insert(s.printJobs).values({ workspaceId: WORKSPACE_ID, number: `T-H${i}`, kind: 'pedido', title: titles[i % titles.length], status: 'terminado', machineId: mach.id, materialId: m.id, estG: gUnit * qty, realG: Math.round(gUnit * qty * (1 + (R() - 0.3) * 0.15)), estH: hUnit * qty * 0.9, realH: +(hUnit * qty * 0.9 * (1.05 + R() * 0.2)).toFixed(2), result: R() > 0.9 ? 'falla_parcial' : 'exito', orderId: id, realStart: daysAgo(age - 1, 9), realEnd: daysAgo(age - 1, 13), createdAt: created }).returning();
      await db.insert(s.jobItems).values({ workspaceId: WORKSPACE_ID, jobId: job.id, orderItemId: items[0].id, qty });
    }
  }
  // ventas rápidas (marketplace, feria, taller)
  for (let i = 0; i < 24; i++) {
    const age = 70 - i * 2.9; const ch = channels[Math.floor(R() * channels.length)]; const v = variants[Math.floor(R() * variants.length)];
    const qty = 1 + Math.floor(R() * 3); const unit = Math.round(v.price * (0.9 + R() * 0.1) / 10) * 10; const sub = unit * qty;
    const commission = Math.round(sub * ch.commissionPct / 100 + (ch.commissionFixed ? ch.commissionFixed : 0)); const cost = v.avgCost * qty;
    const [sale] = await db.insert(s.sales).values({ workspaceId: WORKSPACE_ID, number: `V-H${i}`, channelId: ch.id, customerName: R() > 0.5 ? cPed.name : null, date: ymd(daysAgo(age)), subtotal: sub, commission, shipping: ch.avgShipping, total: sub, costTotal: cost, netMargin: sub - commission - ch.avgShipping - cost, status: age < 4 && ch.kind === 'marketplace' ? 'por_despachar' : 'entregada', paid: sub, createdAt: daysAgo(age) }).returning();
    await db.insert(s.saleItems).values({ workspaceId: WORKSPACE_ID, saleId: sale.id, variantId: v.id, qty, listPrice: v.price, unitPrice: unit, frozenCost: v.avgCost });
  }
  // presupuestos en distintos estados
  const mkQ = async (title: string, cust: typeof cCon, status: string, age: number, grams: number, hours: number, mat: typeof plaNeg) => {
    const qid = await saveQuote({ customerId: cust.id, customerName: cust.name, customerPhone: cust.phone, source: 'whatsapp', title, items: [{ description: title, qty: 2, materialId: mat.id, machineId: a1.id, mode: 'manual', gramsTotal: grams, hoursTotal: hours, origin: { grams: 'manual', hours: 'manual' } }] }, { ...adminUser, permOverrides: {} });
    await db.update(s.quotes).set({ status, createdAt: daysAgo(age), updatedAt: daysAgo(age), frozen: status !== 'borrador', validUntil: ymd(daysAgo(age - (status === 'vencido' ? 15 : 20))) }).where(eq(s.quotes.id, qid));
  };
  await mkQ('Carcasas para sensor', cAro, 'enviado', 5, 180, 7, petgNeg); await mkQ('Piezas FabLab', cFab, 'enviado', 3, 240, 9, plaBla); await mkQ('Figuras para vitrina', cGeek, 'rechazado', 22, 300, 12, plaRoj);
  await mkQ('Soporte monitor', cAnd, 'vencido', 40, 150, 6, plaNeg); await mkQ('Prototipo carcasa', cAro, 'aprobado', 30, 200, 8, petgNeg); await mkQ('Llaveros evento', cCon, 'borrador', 1, 50, 2, plaAzu);
  return { skipped: false, users: [admin.email, op?.email, ve?.email].filter(Boolean) as string[] };
}

