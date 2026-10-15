'use client';
import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { saveDocTemplateAction } from '@/actions/settings';
import { useT } from '@/i18n/client';
import { DEFAULT_QUOTE_TEMPLATE, MAX_CUSTOM_BLOCKS, isCustomId, normalizeTemplate, type DocFont, type DocTemplate, type SectionId } from '@/lib/documents';
import { QuoteDocument, type QuoteDocData } from './quote-document';
import { useAction } from './client';
import type { MessageKey } from '@/i18n/translate';

const custom = (id: string) => isCustomId(id);
const FONTS: DocFont[] = ['sans', 'serif', 'mono'];
const SECTION_LABEL: Record<SectionId, MessageKey> = { customer: 'documents.sec_customer', items: 'documents.sec_items', optionals: 'documents.sec_optionals', totals: 'documents.sec_totals', references: 'documents.sec_references', notes: 'documents.sec_notes', terms: 'documents.sec_terms' };

/** Editor guiado de la plantilla del presupuesto (L1): tema, secciones (orden, visibilidad, textos) y vista previa en vivo con datos de ejemplo. */
export function DocTemplateEditor({ initial, sample, hasLogo }: { initial: Partial<DocTemplate>; sample: QuoteDocData; hasLogo: boolean }) {
  const t = useT(); const { run, pending } = useAction();
  const [tpl, setTpl] = useState<DocTemplate>(() => normalizeTemplate(initial));
  const [logo, setLogo] = useState(hasLogo); const [logoErr, setLogoErr] = useState(''); const [ver, setVer] = useState(0); const fileRef = useRef<HTMLInputElement>(null);
  const setTheme = (p: Partial<DocTemplate['theme']>) => setTpl((o) => ({ ...o, theme: { ...o.theme, ...p } }));
  const setSec = (i: number, p: Partial<DocTemplate['sections'][number]>) => setTpl((o) => ({ ...o, sections: o.sections.map((s, k) => (k === i ? { ...s, ...p } : s)) }));
  const move = (i: number, d: -1 | 1) => setTpl((o) => { const a = [...o.sections]; const j = i + d; if (j < 0 || j >= a.length) return o; [a[i], a[j]] = [a[j], a[i]]; return { ...o, sections: a }; });
  const upload = async (f: File | undefined) => {
    if (!f) return; setLogoErr(''); const fd = new FormData(); fd.set('file', f);
    const r = await fetch('/api/branding/logo', { method: 'POST', body: fd }); const j = await r.json().catch(() => ({}));
    if (!r.ok) setLogoErr(j.error ?? t('settings.logoBadFormat')); else { setLogo(true); setVer((v) => v + 1); }
    if (fileRef.current) fileRef.current.value = '';
  };
  const removeLogo = async () => { await fetch('/api/branding/logo', { method: 'DELETE' }); setLogo(false); };
  const preview: QuoteDocData = { ...sample, shop: { ...sample.shop, logoUrl: logo ? `/api/branding/logo?v=${ver}` : null } };
  return (
    <div className="grid xl:grid-cols-[minmax(0,420px)_1fr] gap-5" data-testid="doc-editor">
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); run(() => saveDocTemplateAction(tpl), { ok: t('documents.saved') }); }}>
        <fieldset className="card p-3 space-y-3"><legend className="eyebrow px-1">{t('documents.theme')}</legend>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><span className="label">{t('documents.brandColor')}</span><div className="flex gap-2"><input type="color" className="h-10 w-14 rounded" value={tpl.theme.brandColor || '#c13d0b'} onChange={(e) => setTheme({ brandColor: e.target.value })} data-testid="doc-color" /><button type="button" className="btn-ghost btn-sm" onClick={() => setTheme({ brandColor: '' })}>{t('documents.useShopColor')}</button></div></label>
            <label className="block"><span className="label">{t('documents.font')}</span><select className="input" value={tpl.theme.font} onChange={(e) => setTheme({ font: e.target.value as DocFont })}>{FONTS.map((f) => <option key={f} value={f}>{t(`documents.font_${f}` as 'documents.font_sans')}</option>)}</select></label>
          </div>
          <div className="flex flex-wrap items-center gap-2"><span className="label !mb-0">{t('documents.logo')}</span><input ref={fileRef} type="file" aria-label={t('documents.logo')} accept="image/png,image/jpeg,image/webp" onChange={(e) => upload(e.target.files?.[0])} data-testid="doc-logo" className="text-sm" />{logo && <button type="button" className="btn-ghost btn-sm" onClick={removeLogo}>{t('documents.removeLogo')}</button>}</div>
          {logoErr && <p role="alert" className="text-sm text-red-600">{logoErr}</p>}
          <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={tpl.theme.showLogo} onChange={(e) => setTheme({ showLogo: e.target.checked })} />{t('documents.showLogo')}</label><label className="flex items-center gap-2"><input type="checkbox" checked={tpl.theme.showThumbs} onChange={(e) => setTheme({ showThumbs: e.target.checked })} />{t('documents.showThumbs')}</label></div>
        </fieldset>
        <fieldset className="card p-3 space-y-3"><legend className="eyebrow px-1">{t('documents.header')}</legend>
          <label className="block"><span className="label">{t('documents.subtitle')}</span><input className="input" value={tpl.header.subtitle} onChange={(e) => setTpl({ ...tpl, header: { subtitle: e.target.value } })} /></label>
          <div className="flex flex-wrap gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={tpl.options.showModelNames} onChange={(e) => setTpl({ ...tpl, options: { ...tpl.options, showModelNames: e.target.checked } })} />{t('documents.showModelNames')}</label><label className="flex items-center gap-2"><input type="checkbox" checked={tpl.options.showLeadTime} onChange={(e) => setTpl({ ...tpl, options: { ...tpl.options, showLeadTime: e.target.checked } })} />{t('documents.showLeadTime')}</label></div>
        </fieldset>
        <fieldset className="card p-3 space-y-2"><legend className="eyebrow px-1">{t('documents.sections')}</legend>
          <p className="muted text-xs">{t('documents.vars')}</p>
          {tpl.sections.map((s, i) => (
            <div key={s.id} className="rounded-xl border border-[var(--line)] p-2.5 space-y-2" data-testid={`doc-sec-${s.id}`}>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 font-medium text-sm flex-1"><input type="checkbox" checked={s.visible} onChange={(e) => setSec(i, { visible: e.target.checked })} aria-label={custom(s.id) ? t('documents.customBlock') : t(SECTION_LABEL[s.id as SectionId])} />{custom(s.id) ? t('documents.customBlock') : t(SECTION_LABEL[s.id as SectionId])}</label>
                <button type="button" className="btn-ghost btn-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={t('documents.moveUp')}><ArrowUp className="h-4 w-4" aria-hidden /></button>
                <button type="button" className="btn-ghost btn-sm" disabled={i === tpl.sections.length - 1} onClick={() => move(i, 1)} aria-label={t('documents.moveDown')}><ArrowDown className="h-4 w-4" aria-hidden /></button>
                {custom(s.id) && <button type="button" className="btn-ghost btn-sm" onClick={() => setTpl((o) => ({ ...o, sections: o.sections.filter((_, k) => k !== i) }))} data-testid={`doc-remove-${s.id}`}>{t('documents.removeBlock')}</button>}
              </div>
              {s.visible && <><input className="input" placeholder={t('documents.sectionTitle')} value={s.title} onChange={(e) => setSec(i, { title: e.target.value })} />
                {(custom(s.id) || ['customer', 'items', 'notes', 'terms'].includes(s.id)) && <textarea className="input" rows={s.id === 'terms' ? 4 : 2} placeholder={s.id === 'terms' ? t('documents.termsPlaceholder') : t('documents.sectionText')} value={s.text} onChange={(e) => setSec(i, { text: e.target.value })} />}</>}
            </div>))}
          {tpl.sections.filter((s) => custom(s.id)).length < MAX_CUSTOM_BLOCKS && <button type="button" className="btn-ghost btn-sm" data-testid="doc-add-block" onClick={() => setTpl((o) => ({ ...o, sections: [...o.sections, { id: `custom:${Math.random().toString(36).slice(2, 8)}`, visible: true, title: '', text: '' }] }))}>{t('documents.addBlock')}</button>}
        </fieldset>
        <label className="block"><span className="label">{t('documents.footer')}</span><textarea className="input" rows={2} value={tpl.footer} onChange={(e) => setTpl({ ...tpl, footer: e.target.value })} /></label>
        <div className="flex gap-2"><button className="btn-primary" disabled={pending} data-testid="doc-save">{t('common.save')}</button><button type="button" className="btn-ghost" onClick={() => setTpl(DEFAULT_QUOTE_TEMPLATE)}>{t('documents.reset')}</button></div>
      </form>
      <div className="min-w-0"><div className="eyebrow mb-2">{t('documents.preview')}</div><div className="card overflow-auto p-0 shadow-sm" style={{ maxHeight: 900 }} data-testid="doc-preview"><QuoteDocument data={preview} template={tpl} t={t} /></div></div>
    </div>
  );
}
