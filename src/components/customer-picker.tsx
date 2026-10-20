'use client';
import { sources } from '@/lib/format';
import { useT } from '@/i18n/client';

export interface CustomerOpt { id: string; name: string; phone: string | null; type: string; priceAdj: number; occasional: boolean; calcProfileId?: string | null }
export interface CustomerValue { customerId: string | null; name: string; phone: string }

/** Cliente existente o cliente ocasional (solo nombre y teléfono, sin ficha). */
export function CustomerPicker({ customers, value, onChange, disabled }: { customers: CustomerOpt[]; value: CustomerValue; onChange: (v: CustomerValue) => void; disabled?: boolean }) {
  const t = useT();
  const existing = customers.find((c) => c.id === value.customerId);
  return (
    <div className="grid sm:grid-cols-3 gap-3">
      <label className="block sm:col-span-1"><span className="label">{t('common.customer')}</span>
        <select className="input" disabled={disabled} value={value.customerId ?? ''} data-testid="customer-select" onChange={(e) => { const c = customers.find((x) => x.id === e.target.value); onChange(c ? { customerId: c.id, name: c.name, phone: c.phone ?? '' } : { customerId: null, name: value.customerId ? '' : value.name, phone: value.customerId ? '' : value.phone }); }}>
          <option value="">{t('orders.walkInCustomerNoRecord')}</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}{c.priceAdj ? ` (${c.priceAdj > 0 ? '+' : ''}${c.priceAdj}%)` : ''}</option>)}
        </select></label>
      <label className="block"><span className="label">{t('common.name')}</span><input className="input" disabled={disabled || !!existing} value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} placeholder={t('orders.customerName')} data-testid="customer-name" /></label>
      <label className="block"><span className="label">{t('orders.phoneWhatsapp')}</span><input className="input" inputMode="tel" disabled={disabled || !!existing} value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} placeholder="+56 9 …" data-testid="customer-phone" /></label>
    </div>
  );
}
export function SourceSelect({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const t = useT();
  return <label className="block"><span className="label">{t('orders.orderSource')}</span><select className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} data-testid="source-select"><option value="">{t('orders.howDidItComeIn')}</option>{Object.entries(sources(t)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>;
}
