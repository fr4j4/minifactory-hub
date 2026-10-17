'use client';
import { useState } from 'react';
import { savePriceListAction, saveProfileAction, saveSettingsAction, saveSupplierAction, saveUserAction } from '@/actions/settings';
import { saleToggleChannelAction } from '@/actions/catalog';
import { Modal, useAction } from './client';
import type { AppSettings } from '@/lib/settings';
import { DEFAULT_MATRIX, type Module } from '@/lib/perm';
import { useLocale, useT } from '@/i18n/client';
import { PALETTE_IDS, PALETTE_NAMES } from '@/lib/palettes';
import type { MessageKey } from '@/i18n/translate';

const num = (e: React.ChangeEvent<HTMLInputElement>) => (e.target.value === '' ? 0 : +e.target.value);

export function ShopForm({ st }: { st: AppSettings }) {
  const t = useT(); const lang = useLocale() === 'en' ? 'en' : 'es';
  const { run, pending } = useAction(); const [v, setV] = useState(st.shop); const [h, setH] = useState(st.workHours); const [hol, setHol] = useState(st.workHours.holidays.join(', '));
  const f = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  return (
    <form className="grid sm:grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSettingsAction({ shop: v, workHours: { ...h, holidays: hol.split(',').map((x) => x.trim()).filter(Boolean) } }), { ok: t('settings.workshopDetailsSaved2') }); }}>
      <label className="block"><span className="label">{t('settings.workshopName')}</span><input className="input" value={v.name} onChange={f('name')} data-testid="shop-name" /></label><label className="block"><span className="label">{t('settings.legalName')}</span><input className="input" value={v.legalName} onChange={f('legalName')} /></label>
      <label className="block"><span className="label">{t('settings.taxId')}</span><input className="input" value={v.taxId} onChange={f('taxId')} /></label><label className="block"><span className="label">{t('settings.phone')}</span><input className="input" value={v.phone} onChange={f('phone')} /></label>
      <label className="block"><span className="label">{t('settings.email2')}</span><input className="input" value={v.email} onChange={f('email')} /></label><label className="block"><span className="label">{t('settings.address')}</span><input className="input" value={v.address} onChange={f('address')} /></label>
      <label className="block"><span className="label">{t('settings.brandColor')}</span><input type="color" className="input !p-1" value={v.brandColor} onChange={f('brandColor')} /></label><label className="block"><span className="label">{t('settings.timeZone')}</span><input className="input" value={v.timezone} onChange={f('timezone')} /></label>
      <label className="block"><span className="label">{t('theme.shopPalette')}</span><select className="input" value={v.palette ?? 'capa'} onChange={(e) => setV({ ...v, palette: e.target.value })} data-testid="shop-palette">{PALETTE_IDS.map((id) => <option key={id} value={id}>{PALETTE_NAMES[id][lang]}</option>)}</select><span className="muted text-xs">{t('theme.shopPaletteHint')}</span></label>
      <div className="sm:col-span-2 border-t border-slate-200 dark:border-slate-700 pt-3"><h3 className="font-medium text-sm mb-2">{t('settings.workshopCalendarForTheGantt')}</h3>
        <div className="grid sm:grid-cols-4 gap-3"><label className="block"><span className="label">{t('settings.opens')}</span><input type="time" className="input" value={h.start} onChange={(e) => setH({ ...h, start: e.target.value })} /></label><label className="block"><span className="label">{t('settings.closes')}</span><input type="time" className="input" value={h.end} onChange={(e) => setH({ ...h, end: e.target.value })} /></label>
          <div className="sm:col-span-2"><span className="label">{t('settings.workingDays')}</span><div className="flex flex-wrap gap-1">{t('settings.weekdayInitials').split(',').map((d, i) => <button type="button" key={i} aria-pressed={h.days.includes(i)} onClick={() => setH({ ...h, days: h.days.includes(i) ? h.days.filter((x) => x !== i) : [...h.days, i] })} className={`btn-ghost btn-sm !px-3 ${h.days.includes(i) ? '!bg-[var(--panel)] !text-[var(--panel-ink)] dark:!bg-slate-700' : ''}`}>{d}</button>)}</div></div></div>
        <label className="block mt-3"><span className="label">{t('settings.holidaysYyyyMmDdComma')}</span><input className="input" value={hol} onChange={(e) => setHol(e.target.value)} /></label></div>
      <div className="sm:col-span-2 flex justify-end"><button className="btn-primary" disabled={pending}>{t('common.save')}</button></div>
    </form>
  );
}

export function RatesForm({ st }: { st: AppSettings }) {
  const t = useT();
  const { run, pending } = useAction(); const [r, setR] = useState(st.rates); const [valid, setValid] = useState(st.quoteValidDays); const [follow, setFollow] = useState((st.quoteFollowUpDays ?? []).join(', ')); const [resv, setResv] = useState(st.reservationDays); const [dep, setDep] = useState(st.minDepositPct);
  const f = (k: keyof typeof r) => (e: React.ChangeEvent<any>) => setR({ ...r, [k]: e.target.type === 'number' ? num(e) : e.target.value });
  return (
    <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => saveSettingsAction({ rates: { ...r, taxMode: 'exento' as const }, quoteValidDays: valid, quoteFollowUpDays: follow.split(/[\s,;]+/).map(Number).filter((n) => Number.isFinite(n) && n > 0), reservationDays: resv, minDepositPct: dep }), { ok: t('settings.ratesSavedQuotesThatWere2') }); }}>
      <p className="text-xs muted">{t('settings.quotesThatAreSentOr')}</p>
      <div className="grid sm:grid-cols-3 gap-3 rounded-xl border border-[var(--line)] p-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!r.taxDefault} onChange={(e) => setR({ ...r, taxDefault: e.target.checked })} data-testid="rate-tax-default" />{t('settings.taxDefault')}</label><span className="muted text-xs sm:col-span-2">{t('settings.pricingNetHint')}</span>
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <label className="block"><span className="label">{t('settings.energyKwh')}</span><input type="number" className="input" value={r.kwh} onChange={f('kwh')} data-testid="rate-kwh" /></label><label className="block"><span className="label">{t('settings.laborHour')}</span><input type="number" className="input" value={r.laborHour} onChange={f('laborHour')} data-testid="rate-labor" /></label><label className="block"><span className="label">{t('settings.defaultPreparationMin')}</span><input type="number" className="input" value={r.prepMinutes} onChange={f('prepMinutes')} /></label>
        <label className="block"><span className="label">{t('settings.waste')}</span><input type="number" className="input" value={r.wastePct} onChange={f('wastePct')} /></label><label className="block"><span className="label">{t('settings.defaultFailureRate')}</span><input type="number" className="input" value={r.failRatePct} onChange={f('failRatePct')} /></label><label className="block"><span className="label">{t('settings.defaultMarginOverCost')}</span><input type="number" className="input" value={r.marginPct} onChange={f('marginPct')} data-testid="rate-margin" /></label>
        <label className="block"><span className="label">{t('settings.minimumMarginAlert')}</span><input type="number" className="input" value={r.minMarginPct} onChange={f('minMarginPct')} /></label><label className="block"><span className="label">{t('settings.minimumPricePerItem')}</span><input type="number" className="input" value={r.minPrice} onChange={f('minPrice')} /></label>
        <label className="block"><span className="label">{t('settings.rounding')}</span><select className="input" value={r.rounding.mode} onChange={(e) => setR({ ...r, rounding: { ...r.rounding, mode: e.target.value as any } })}><option value="none">{t('settings.noRounding')}</option><option value="step">{t('settings.toMultiplesOf')}</option><option value="ending990">{t('settings.endingIn990')}</option></select></label>
        {r.rounding.mode === 'step' && <label className="block"><span className="label">{t('settings.roundTo')}</span><input type="number" className="input" value={r.rounding.step} onChange={(e) => setR({ ...r, rounding: { ...r.rounding, step: num(e) } })} /></label>}
        <label className="block"><span className="label">{t('settings.vat')}</span><input type="number" className="input" value={r.taxPct} onChange={f('taxPct')} /></label>
        <label className="block"><span className="label">{t('settings.quoteValidityDays')}</span><input type="number" className="input" value={valid} onChange={(e) => setValid(num(e))} /></label><label className="block"><span className="label">{t('settings.quoteFollowUpDays')}</span><input className="input" value={follow} onChange={(e) => setFollow(e.target.value)} placeholder="3, 7" data-testid="follow-up-days" /><span className="muted text-xs">{t('settings.quoteFollowUpHint')}</span></label><label className="block"><span className="label">{t('settings.reservationExpiryDays')}</span><input type="number" className="input" value={resv} onChange={(e) => setResv(num(e))} /></label><label className="block"><span className="label">{t('settings.suggestedDeposit')}</span><input type="number" className="input" value={dep} onChange={(e) => setDep(num(e))} /></label>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div><h3 className="text-sm font-medium mb-1.5">{t('settings.rushSurcharges')}</h3>{r.urgency.map((u, i) => <div key={u.key} className="grid grid-cols-3 gap-2 mb-1.5"><input className="input col-span-2" value={u.label} onChange={(e) => setR({ ...r, urgency: r.urgency.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)) })} aria-label={t('common.name')} /><input type="number" className="input" value={u.pct} onChange={(e) => setR({ ...r, urgency: r.urgency.map((x, k) => (k === i ? { ...x, pct: num(e) } : x)) })} aria-label={t('settings.percentage')} /></div>)}</div>
        <div><h3 className="text-sm font-medium mb-1.5">{t('settings.volumeDiscountFromNUnits')}</h3>{r.volumeTiers.map((tt, i) => <div key={i} className="grid grid-cols-2 gap-2 mb-1.5"><input type="number" className="input" value={tt.minQty} onChange={(e) => setR({ ...r, volumeTiers: r.volumeTiers.map((x, k) => (k === i ? { ...x, minQty: num(e) } : x)) })} aria-label={t('settings.fromUnits')} /><input type="number" className="input" value={tt.pct} onChange={(e) => setR({ ...r, volumeTiers: r.volumeTiers.map((x, k) => (k === i ? { ...x, pct: num(e) } : x)) })} aria-label={t('settings.percentage')} /></div>)}<button type="button" className="btn-ghost btn-sm" onClick={() => setR({ ...r, volumeTiers: [...r.volumeTiers, { minQty: 100, pct: -25 }] })}>{t('settings.tier')}</button></div>
      </div>
      <div className="flex justify-end"><button className="btn-primary" disabled={pending} data-testid="rates-save">{t('settings.saveRates')}</button></div>
    </form>
  );
}

/** {YYYY} y {N…} obligatorios: el navegador marca el campo que falla y no envía el formulario. */
const NUMBERING_PATTERN = '(?=.*\\{YYYY\\})(?=.*\\{N+\\}).*';
const NUMBERING_RE = new RegExp(`^${NUMBERING_PATTERN}$`);

export function TemplatesForm({ st }: { st: AppSettings }) {
  const t = useT();
  const { run, pending } = useAction(); const [tt, setT] = useState(st.templates); const [n, setN] = useState(st.numbering);
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSettingsAction({ templates: tt, numbering: n }), { ok: t('settings.templatesSaved2') }); }}>
      <p className="text-xs muted">{t('settings.variablesLabel')} <code>{'{cliente} {numero} {total} {vigencia} {seguimiento}'}</code>. {t('settings.templatesNote')}</p>
      {([['terms', t('settings.termsAndConditionsQuotePdf')], ['whatsappQuote', t('settings.quoteMessage')], ['whatsappReady', t('settings.orderReadyMessage')], ['whatsappShipped', t('settings.shippingMessage')]] as const).map(([k, l]) => <label key={k} className="block"><span className="label">{l}</span><textarea className="input h-20" value={tt[k]} onChange={(e) => setT({ ...tt, [k]: e.target.value })} /></label>)}
      <h3 className="text-sm font-medium pt-2">{t('settings.documentNumbering')}</h3>
      <div className="grid sm:grid-cols-5 gap-3">{(['quote', 'order', 'sale', 'job', 'production'] as const).map((k) => <label key={k} className="block"><span className="label">{{ quote: t('common.quote'), order: t('common.order'), sale: t('settings.sale'), job: t('common.job'), production: t('settings.production') }[k]}</span><input className="input tabular" value={n[k]} onChange={(e) => setN({ ...n, [k]: e.target.value })} required pattern={NUMBERING_PATTERN} title={t('settings.numberingNeedsYear')} aria-invalid={!NUMBERING_RE.test(n[k])} data-testid={`numbering-${k}`} /></label>)}</div>
      <p className="text-xs muted">{t('settings.numberingExample')} <code>P-{'{YYYY}'}-{'{NNNN}'}</code> {t('settings.numberingExample2')}</p>
      <div className="flex justify-end"><button className="btn-primary" disabled={pending}>{t('common.save')}</button></div>
    </form>
  );
}

const MODS: Array<[Module, MessageKey]> = [['pedidos', 'nav.orders'], ['presupuestos', 'nav.quotes'], ['clientes', 'nav.customers'], ['archivos', 'nav.files'], ['laminador', 'nav.slicer'], ['catalogo', 'nav.catalog'], ['ventas', 'sales.quickSales'], ['inventario', 'nav.inventory'], ['maquinas', 'nav.machines'], ['cola', 'nav.queue'], ['galeria', 'nav.gallery'], ['pagos', 'settings.modulePayments'], ['reportes', 'nav.reports'], ['config', 'nav.settings'], ['ia', 'ai.moduleName']];
export function UserDialog({ u, trigger, selfId }: { u?: { id: string; name: string; email: string; role: string; active: boolean; permOverrides: Record<string, string> }; trigger: React.ReactNode; selfId: string }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const init = () => ({ name: u?.name ?? '', email: u?.email ?? '', role: u?.role ?? 'operador', password: '', active: u?.active ?? true }); const [v, setV] = useState(init); const [ov, setOv] = useState<Record<string, string>>(u?.permOverrides ?? {});
  const eff = (m: Module) => ov[m] ?? (DEFAULT_MATRIX as any)[v.role][m] ?? '';
  const toggle = (m: Module, a: string) => { const cur = eff(m); const next = cur.includes(a) ? cur.replace(a, '') : cur + a; setOv({ ...ov, [m]: ['V', 'C', 'E', 'X'].filter((x) => next.includes(x)).join('') }); };
  return (<><span onClick={() => { setV(init()); setOv(u?.permOverrides ?? {}); setOpen(true); }} className="inline-block">{trigger}</span>
    <Modal open={open} onClose={() => setOpen(false)} title={u ? t('settings.edit', { u: u.name }) : t('settings.newUser')} wide>
      <div className="grid sm:grid-cols-2 gap-3"><label className="block"><span className="label">{t('common.name')}</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="user-name" /></label><label className="block"><span className="label">{t('settings.email')}</span><input className="input" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} data-testid="user-email" /></label>
        <label className="block"><span className="label">{t('settings.role')}</span><select className="input" value={v.role} onChange={(e) => { setV({ ...v, role: e.target.value }); setOv({}); }} data-testid="user-role"><option value="admin">{t('settings.administrator')}</option><option value="operador">{t('settings.operator')}</option><option value="ventas">{t('common.sales')}</option></select></label><label className="block"><span className="label">{u ? t('settings.newPasswordOptional') : t('settings.passwordMin8')}</span><input className="input" type="password" autoComplete="new-password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} data-testid="user-pass" /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} disabled={u?.id === selfId} /> {t('settings.activeUser')}</label></div>
      <h3 className="text-sm font-medium mt-4 mb-1">{t('settings.permissionsByModule')} <span className="muted font-normal">{t('settings.vViewCCreateE')}</span></h3>
      <div className="overflow-x-auto" tabIndex={0}><table className="w-full text-sm"><tbody>{MODS.map(([m, lk]) => { const l = t(lk); return <tr key={m} className="border-t border-slate-100 dark:border-slate-800"><td className="py-1.5 pr-3">{l}</td>{['V', 'C', 'E', 'X'].map((a) => <td key={a} className="px-1"><label className="inline-flex items-center gap-1"><input type="checkbox" checked={eff(m).includes(a)} onChange={() => toggle(m, a)} aria-label={`${l} ${a}`} />{a}</label></td>)}</tr>; })}</tbody></table></div>
      <div className="flex justify-end gap-2 mt-4"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending} data-testid="user-save" onClick={() => run(() => saveUserAction({ id: u?.id, ...v, password: v.password || undefined, permOverrides: ov }), { ok: t('settings.userSaved2'), onOk: () => setOpen(false) })}>{t('common.save')}</button></div>
    </Modal></>);
}

export function ChannelDialog({ c, trigger }: { c?: { id: string; name: string; kind: string; commissionPct: number; commissionFixed: number; avgShipping: number; active: boolean }; trigger: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const init = () => ({ name: c?.name ?? '', kind: c?.kind ?? 'marketplace', commissionPct: c?.commissionPct ?? 0, commissionFixed: c?.commissionFixed ?? 0, avgShipping: c?.avgShipping ?? 0, active: c?.active ?? true }); const [v, setV] = useState(init);
  return (<><span onClick={() => { setV(init()); setOpen(true); }} className="inline-block">{trigger}</span>
    <Modal open={open} onClose={() => setOpen(false)} title={c ? t('settings.editChannel') : t('settings.newSalesChannel')}><div className="grid grid-cols-2 gap-3"><label className="block col-span-2"><span className="label">{t('common.name')}</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="channel-name" /></label><label className="block"><span className="label">{t('common.typeLabel')}</span><select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="directo">{t('settings.direct')}</option><option value="marketplace">{t('settings.marketplace')}</option><option value="feria">{t('settings.fair')}</option><option value="redes">{t('settings.socialMedia')}</option></select></label><label className="block"><span className="label">{t('settings.commission')}</span><input type="number" step="0.1" className="input" value={v.commissionPct} onChange={(e) => setV({ ...v, commissionPct: +e.target.value })} data-testid="channel-pct" /></label><label className="block"><span className="label">{t('settings.fixedCommission')}</span><input type="number" className="input" value={v.commissionFixed} onChange={(e) => setV({ ...v, commissionFixed: +e.target.value })} /></label><label className="block"><span className="label">{t('settings.averageShipping')}</span><input type="number" className="input" value={v.avgShipping} onChange={(e) => setV({ ...v, avgShipping: +e.target.value })} /></label><label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} /> {t('settings.activeChannel')}</label>
      <div className="col-span-2 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || !v.name.trim()} data-testid="channel-save" onClick={() => run(() => saleToggleChannelAction({ id: c?.id, ...v }), { ok: t('settings.channelSaved2'), onOk: () => setOpen(false) })}>{t('common.save')}</button></div></div></Modal></>);
}

export function PriceListDialog({ p, trigger }: { p?: { id: string; name: string; adjustPct: number }; trigger: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction(); const [name, setName] = useState(p?.name ?? ''); const [pct, setPct] = useState(p?.adjustPct ?? 0);
  return (<><span onClick={() => { setName(p?.name ?? ''); setPct(p?.adjustPct ?? 0); setOpen(true); }} className="inline-block">{trigger}</span><Modal open={open} onClose={() => setOpen(false)} title={t('settings.priceList2')}><div className="space-y-3"><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('settings.nameReseller')} aria-label={t('common.name')} /><label className="block"><span className="label">{t('settings.adjustmentOverTheSuggestedPrice')}</span><input type="number" className="input" value={pct} onChange={(e) => setPct(+e.target.value)} /></label><div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || !name.trim()} onClick={() => run(() => savePriceListAction({ id: p?.id, name, adjustPct: pct }), { ok: t('settings.saved2'), onOk: () => setOpen(false) })}>{t('common.save')}</button></div></div></Modal></>);
}

const NOTIFS: Array<[string, MessageKey]> = [['stock_bajo', 'settings.notifLowStock'], ['mantenimiento', 'machines.maintenanceOverdue'], ['trabajo_terminado', 'settings.notifJobFinished'], ['trabajo_fallido', 'settings.notifJobFailed'], ['marketplace', 'settings.notifSaleToShip']];
export function ProfileForm({ prefs }: { prefs: Record<string, boolean> }) {
  const t = useT();
  const { run, pending } = useAction(); const [p, setP] = useState(prefs); const [cur, setCur] = useState(''); const [nw, setNw] = useState('');
  return (
    <form className="space-y-4 max-w-xl" onSubmit={(e) => { e.preventDefault(); run(() => saveProfileAction({ notifPrefs: p, currentPassword: cur, newPassword: nw || undefined }), { ok: t('settings.profileSaved2'), onOk: () => { setCur(''); setNw(''); } }); }}>
      <div><h3 className="text-sm font-medium mb-2">{t('settings.alertsIWantToReceive')}</h3><ul className="space-y-1.5">{NOTIFS.map(([k, lk]) => <li key={k}><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={p[k] !== false} onChange={(e) => setP({ ...p, [k]: e.target.checked })} /> {t(lk)}</label></li>)}</ul></div>
      <div className="grid sm:grid-cols-2 gap-3"><label className="block"><span className="label">{t('settings.currentPassword')}</span><input type="password" className="input" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} /></label><label className="block"><span className="label">{t('settings.newPasswordMin8')}</span><input type="password" className="input" autoComplete="new-password" value={nw} onChange={(e) => setNw(e.target.value)} /></label></div>
      <button className="btn-primary" disabled={pending}>{t('common.save')}</button>
    </form>
  );
}

export interface SupplierRow { id: string; name: string; kind: string; country: string; city: string | null; url: string | null; notes: string | null; verified: boolean; recoversVat?: boolean; active: boolean }
export const SUPPLIER_KINDS = ['tienda_especializada', 'marketplace', 'marketplace_vendedor', 'fabricante', 'importador', 'distribuidor_marca', 'tienda_marca', 'tienda_internacional', 'servicio_casillero', 'retail', 'otro'] as const;
export function SupplierDialog({ sp, trigger }: { sp?: SupplierRow; trigger: React.ReactNode }) {
  const t = useT();
  const [open, setOpen] = useState(false); const { run, pending } = useAction();
  const init = () => ({ name: sp?.name ?? '', kind: sp?.kind ?? 'tienda_especializada', country: sp?.country ?? 'CL', city: sp?.city ?? '', url: sp?.url ?? '', notes: sp?.notes ?? '', verified: sp?.verified ?? false, recoversVat: sp?.recoversVat ?? false, active: sp?.active ?? true });
  const [v, setV] = useState(init);
  return (<><span onClick={() => { setV(init()); setOpen(true); }} className="inline-block">{trigger}</span>
    <Modal open={open} onClose={() => setOpen(false)} title={sp ? t('settings.editSupplier') : t('settings.newSupplier')}>
      <div className="grid grid-cols-2 gap-3">
        <label className="block col-span-2"><span className="label">{t('common.name')}</span><input className="input" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} data-testid="supplier-name" /></label>
        <label className="block"><span className="label">{t('settings.supplierKind')}</span><select className="input" value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}>{SUPPLIER_KINDS.map((k) => <option key={k} value={k}>{t(`settings.supplierKind_${k}` as 'settings.supplierKind_otro')}</option>)}</select></label>
        <label className="block"><span className="label">{t('settings.supplierCountry')}</span><input className="input" value={v.country} onChange={(e) => setV({ ...v, country: e.target.value })} maxLength={6} /></label>
        <label className="block"><span className="label">{t('settings.supplierCity')}</span><input className="input" value={v.city} onChange={(e) => setV({ ...v, city: e.target.value })} /></label>
        <label className="block"><span className="label">URL</span><input className="input" value={v.url} onChange={(e) => setV({ ...v, url: e.target.value })} /></label>
        <label className="block col-span-2"><span className="label">{t('common.notes')}</span><textarea className="input" rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.verified} onChange={(e) => setV({ ...v, verified: e.target.checked })} />{t('settings.supplierVerified')}</label>
        <label className="flex items-center gap-2 text-sm col-span-2"><input type="checkbox" checked={v.recoversVat} onChange={(e) => setV({ ...v, recoversVat: e.target.checked })} data-testid="supplier-recovers-vat" /><span>{t('settings.supplierRecoversVat')}<span className="muted text-xs block">{t('settings.supplierRecoversVatHint')}</span></span></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />{t('common.active')}</label>
        <div className="col-span-2 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-primary" disabled={pending || !v.name.trim()} data-testid="supplier-save" onClick={() => run(() => saveSupplierAction({ id: sp?.id, ...v }), { ok: t('settings.supplierSaved'), onOk: () => setOpen(false) })}>{t('common.save')}</button></div>
      </div>
    </Modal></>);
}
