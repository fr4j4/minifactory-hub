'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/format';
import { logoutAction } from '@/actions/auth';
import { useT } from '@/i18n/client';
import { LocaleSwitcher } from './locale-switcher';

export interface NavItem { href: string; label: string; icon: string; group: 'main' | 'more' }
const ICONS: Record<string, string> = {
  home: 'M3 11l9-8 9 8v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2z', orders: 'M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01', quote: 'M7 3h8l4 4v14H7zM15 3v4h4M10 12h6M10 16h6', calc: 'M6 3h12v18H6zM9 7h6M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8', cube: 'M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10', slice: 'M4 7h16M4 12h16M4 17h10', box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10', bag: 'M6 7h12l1 14H5zM9 7a3 3 0 0 1 6 0', cart: 'M3 4h2l2.4 11h10.2L20 7H6M9 20h.01M17 20h.01',
  printer: 'M7 8V3h10v5M6 17H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M7 14h10v7H7z', queue: 'M4 6h16M4 12h10M4 18h6', image: 'M3 5h18v14H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M21 16l-5-5-8 8', chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2', cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  plus: 'M12 5v14M5 12h14', search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16M21 21l-4.3-4.3', bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0', menu: 'M4 6h16M4 12h16M4 18h16', camera: 'M3 8h4l2-3h6l2 3h4v12H3zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8', qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2z',
};
export function Icon({ name, className = 'h-5 w-5' }: { name: string; className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[name] ?? ICONS.box} /></svg>;
}

const SECTIONS: Array<{ t: 'nav.shop' | 'nav.sectionProduction' | 'nav.sectionStock' | 'nav.sectionSystem'; hrefs: string[] }> = [
  { t: 'nav.shop', hrefs: ['/', '/pedidos', '/presupuestos', '/clientes', '/calculadora'] },
  { t: 'nav.sectionProduction', hrefs: ['/archivos', '/laminador', '/cola', '/maquinas'] },
  { t: 'nav.sectionStock', hrefs: ['/inventario', '/catalogo', '/ventas'] },
  { t: 'nav.sectionSystem', hrefs: ['/galeria', '/reportes', '/configuracion'] },
];
const CRUMB = { nuevo: 'nav.crumbNew', nueva: 'nav.crumbNewF', perfil: 'nav.crumbProfile', perfiles: 'nav.crumbProfiles', bobinas: 'nav.crumbSpools', escanear: 'nav.crumbScan', etiquetas: 'nav.crumbLabels' } as const;

/** Marca: capas apiladas bajo una boquilla. */
export function Mark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#232220" />
      <g fill="#ff5b1f"><rect x="7" y="21" width="18" height="3" rx="1" /><rect x="9" y="17" width="14" height="3" rx="1" opacity=".8" /><rect x="11" y="13" width="10" height="3" rx="1" opacity=".6" /></g>
      <path d="M13.5 5h5l-1 4h-3z" fill="#e9e5dc" /><circle cx="16" cy="10.6" r=".9" fill="#ff5b1f" />
    </svg>
  );
}

export function AppShell({ nav, user, unread, children }: { nav: NavItem[]; user: { name: string; role: string }; unread: number; children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter(); const t = useT();
  const [more, setMore] = useState(false); const [plus, setPlus] = useState(false); const [search, setSearch] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setMore(false); setPlus(false); }, [path]);
  // reanima la entrada al navegar sin volver a montar la página (un key por ruta perdería el estado
  // de formularios que cambian la URL con replaceState, p. ej. /presupuestos/nuevo → /presupuestos/:id)
  const pageRef = useRef<HTMLDivElement>(null); const prevPath = useRef(path);
  useEffect(() => {
    const prev = prevPath.current; prevPath.current = path; const el = pageRef.current;
    if (!el || prev === path || /\/(nuevo|nueva)$/.test(prev)) return;
    el.classList.remove('page-enter'); void el.offsetWidth; el.classList.add('page-enter');
  }, [path]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); } if (e.key === 'Escape') { setSearch(false); setMore(false); setPlus(false); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const bottom = ['/', '/pedidos', '/cola', '/inventario'].map((h) => nav.find((n) => n.href === h)).filter(Boolean) as NavItem[];
  const quick = [
    { href: '/pedidos/nuevo', label: t('shell.quickNewOrder'), icon: 'orders' }, { href: '/ventas/nueva', label: t('shell.quickQuickSale'), icon: 'cart' },
    { href: '/presupuestos/nuevo', label: t('shell.quickNewQuote'), icon: 'quote' }, { href: '/calculadora', label: t('shell.quickCalculator'), icon: 'calc' },
    { href: '/galeria?subir=1', label: t('shell.quickUploadPhoto'), icon: 'camera' }, { href: '/inventario/escanear', label: t('shell.quickScanQr'), icon: 'qr' },
  ];
  const sections = SECTIONS.map((s) => ({ t: t(s.t), items: s.hrefs.map((h) => nav.find((n) => n.href === h)).filter(Boolean) as NavItem[] })).filter((s) => s.items.length);
  const section = nav.filter((n) => active(n.href)).sort((a, b) => b.href.length - a.href.length)[0];
  const tail = section ? path.slice(section.href.length).split('/').filter(Boolean) : [];
  const full = !collapsed;
  return (
    <div className="min-h-screen md:flex">
      {/* panel de control: riel con íconos en tablet, completo en escritorio */}
      <aside className={cn('hidden md:flex flex-col sticky top-0 h-screen shrink-0 transition-[width] duration-300 border-r border-transparent dark:border-white/[.06] bg-[var(--panel)] text-[var(--panel-ink)] no-print', full ? 'md:w-[72px] xl:w-[244px]' : 'md:w-[72px]')} aria-label={t('nav.main')}>
        <Link href="/" className="flex items-center gap-3 px-[18px] h-16 shrink-0">
          <Mark className="h-9 w-9 shrink-0" />
          <span className={cn('hidden leading-none', full && 'xl:block')}><span className="block font-display text-[17px] font-semibold tracking-tight">MiniFactory</span><span className="block font-mono text-[10px] uppercase tracking-[.16em] text-white/60 mt-1">{t('nav.tagline')}</span></span>
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 pb-3 space-y-4 [scrollbar-width:thin]">
          {sections.map((s) => (
            <div key={s.t}>
              <div className={cn('hidden px-3 pb-1.5 pt-1 font-mono text-[10px] uppercase tracking-[.16em] text-white/55', full && 'xl:block')}>{s.t}</div>
              <div className={cn('mx-2 mb-2 h-px bg-white/10', full ? 'xl:hidden' : '')} aria-hidden />
              <div className="space-y-0.5">
                {s.items.map((n) => { const on = active(n.href); return (
                  <Link key={n.href} href={n.href} aria-current={on ? 'page' : undefined} title={n.label}
                    className={cn('group relative flex items-center gap-3 rounded-xl px-3 py-2 text-[13.5px] min-h-[40px] transition-colors', on ? 'bg-white/[.08] text-white font-medium' : 'text-white/75 hover:text-white hover:bg-white/[.05]')}>
                    {on && <span className="absolute -left-3 top-2 bottom-2 w-[3px] rounded-r-full bg-[var(--accent)] shadow-[0_0_12px_2px_rgba(255,91,31,.55)]" aria-hidden />}
                    <Icon name={n.icon} className={cn('h-[18px] w-[18px] shrink-0 transition-colors', on ? 'text-[var(--accent)]' : 'text-white/60 group-hover:text-white')} />
                    <span className={cn('hidden truncate', full && 'xl:inline')}>{n.label}</span>
                  </Link>); })}
              </div>
            </div>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className={cn('hidden items-center gap-2.5 px-2 pb-2', full && 'xl:flex')}>
            <span className="h-8 w-8 rounded-full bg-white/10 grid place-items-center font-display font-semibold text-sm">{user.name.slice(0, 1)}</span>
            <span className="min-w-0 leading-tight"><span className="block text-[13px] truncate">{user.name}</span><span className="block font-mono text-[10px] uppercase tracking-[.12em] text-white/55">{user.role}</span></span>
          </div>
          <button className="hidden xl:flex w-full items-center justify-center gap-2 rounded-lg min-h-[32px] text-xs text-white/60 hover:text-white hover:bg-white/[.06]" onClick={() => setCollapsed((c) => !c)} aria-label={collapsed ? t('shell.expandMenu') : t('shell.collapseMenu')}>{collapsed ? '»' : t('shell.collapse')}</button>
        </div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-16 bg-[var(--bg)]/80 backdrop-blur-xl border-b border-[var(--line)] flex items-center gap-3 px-3 md:px-6 no-print">
          <Link href="/" className="md:hidden grid place-items-center h-11 w-11 -ml-1" aria-label={t('shell.home')}><Mark className="h-8 w-8" /></Link>
          <nav aria-label={t('nav.location')} className="hidden lg:flex items-center gap-2 font-mono text-[11px] uppercase tracking-[.12em] text-slate-600 dark:text-slate-400 shrink-0">
            <span>{t('nav.shop')}</span>{section && <><span className="text-slate-400 dark:text-slate-600">/</span><Link href={section.href} className={cn(tail.length ? 'hover:text-[var(--accent-ink)]' : 'text-[var(--ink)]')}>{section.label}</Link></>}
            {tail.length > 0 && <><span className="text-slate-400 dark:text-slate-600">/</span><span className="text-[var(--ink)] max-w-[120px] truncate">{t(CRUMB[tail[0] as keyof typeof CRUMB] ?? 'nav.crumbDetail')}</span></>}
          </nav>
          <button onClick={() => setSearch(true)} className="flex-1 min-w-0 max-w-md lg:ml-4 flex items-center gap-2.5 rounded-full border border-[var(--line)] bg-[var(--card)] px-4 text-sm muted min-h-[40px] text-left hover:border-slate-400 dark:hover:border-slate-500 transition-colors" aria-label={t('shell.searchAria')}>
            <Icon name="search" className="h-4 w-4" /><span className="truncate"><span className="sm:hidden">{t('shell.searchShort')}</span><span className="hidden sm:inline">{t('shell.searchLong')}</span></span><kbd className="ml-auto hidden md:inline font-mono text-[10px] rounded-md px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <div className="relative hidden md:block">
              <button onClick={() => setPlus((p) => !p)} className="btn-primary !min-h-[38px] !rounded-full !px-4" aria-expanded={plus} aria-haspopup="menu"><Icon name="plus" className="h-4 w-4" /> {t('shell.newMenu')}</button>
              {plus && <div className="absolute right-0 mt-2 card p-1.5 w-60 shadow-2xl animate-rise z-50" role="menu">{quick.map((q) => <Link key={q.href} href={q.href} role="menuitem" className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 group"><span className="h-8 w-8 rounded-lg bg-slate-100 dark:bg-slate-800 grid place-items-center group-hover:bg-[var(--accent)] group-hover:text-[#17161a] transition-colors"><Icon name={q.icon} className="h-4 w-4" /></span>{q.label}</Link>)}</div>}
            </div>
            <Link href="/notificaciones" className="relative grid place-items-center h-11 w-11 md:h-10 md:w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={unread ? t('shell.notificationsUnread', { n: unread }) : t('shell.notifications')}><Icon name="bell" className="h-5 w-5" />{unread > 0 && <span className="absolute top-1 right-1 h-[18px] min-w-[18px] px-1 rounded-full bg-[var(--accent)] text-[#17161a] font-mono text-[10px] font-semibold grid place-items-center ring-2 ring-[var(--bg)]">{unread}</span>}</Link>
            <details className="relative">
              <summary className="list-none cursor-pointer grid place-items-center h-11 w-11 md:h-10 md:w-10 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800" aria-label={t('shell.account')}><span className="h-8 w-8 rounded-full bg-[var(--panel)] text-[var(--panel-ink)] dark:bg-slate-700 grid place-items-center font-display font-semibold text-sm">{user.name.slice(0, 1)}</span></summary>
              <div className="absolute right-0 mt-2 w-60 card p-2 z-40 shadow-2xl animate-rise">
                <div className="px-2 py-2"><div className="text-sm font-medium">{user.name}</div><div className="eyebrow !text-[10px] mt-0.5">{user.role}</div></div>
                <Link href="/configuracion/perfil" className="block rounded-lg px-2 py-3 min-h-[44px] text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{t('shell.profileLink')}</Link>
                <div className="px-2 py-1.5"><LocaleSwitcher /></div>
                <form action={logoutAction}><button className="w-full text-left rounded-lg px-2 py-3 min-h-[44px] text-sm hover:bg-slate-100 dark:hover:bg-slate-800">{t('shell.logout')}</button></form>
              </div>
            </details>
          </div>
        </header>
        <main id="contenido" className="flex-1 p-3 sm:p-4 md:p-7 pb-28 md:pb-10 max-w-[1500px] w-full mx-auto"><div ref={pageRef} className="page-enter">{children}</div></main>
      </div>
      {/* barra inferior móvil: panel oscuro con botón de acción central */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[var(--panel)] text-[var(--panel-ink)] grid grid-cols-5 safe-bottom no-print rounded-t-2xl shadow-[0_-8px_24px_-12px_rgba(0,0,0,.35)]" aria-label={t('nav.mobile')}>
        {bottom.slice(0, 2).map((n) => <BottomLink key={n.href} n={n} on={active(n.href)} />)}
        <div className="grid place-items-center"><button onClick={() => setPlus((p) => !p)} aria-label={t('shell.quickActions')} aria-expanded={plus} className={cn('h-14 w-14 -mt-6 rounded-2xl bg-[var(--accent)] text-[#17161a] grid place-items-center shadow-[0_2px_0_#b8410f,0_10px_24px_-6px_rgba(255,91,31,.7)] transition-transform', plus && 'rotate-45')}><Icon name="plus" className="h-6 w-6" /></button></div>
        {bottom.slice(2).map((n) => <BottomLink key={n.href} n={n} on={active(n.href)} />)}
        <button onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-1 py-1.5 min-h-[60px] text-[11px] text-white/70 col-start-5 row-start-1" aria-label={t('shell.moreAria')}><Icon name="menu" className="h-5 w-5" /><span>{t('shell.more')}</span></button>
      </nav>
      {plus && <Sheet onClose={() => setPlus(false)} title={t('shell.quickActions')}><div className="grid grid-cols-2 gap-2">{quick.map((q) => <Link key={q.href} href={q.href} className="card p-4 flex flex-col items-start gap-3 text-sm font-medium min-h-[96px] justify-between"><span className="h-9 w-9 rounded-xl bg-[var(--accent)] text-[#17161a] grid place-items-center"><Icon name={q.icon} className="h-5 w-5" /></span>{q.label}</Link>)}</div></Sheet>}
      {more && <Sheet onClose={() => setMore(false)} title={t('shell.allSections')}><div className="space-y-4">{sections.map((s) => <div key={s.t}><div className="eyebrow mb-2">{s.t}</div><div className="grid grid-cols-3 gap-2">{s.items.map((n) => <Link key={n.href} href={n.href} className={cn('rounded-xl border p-3 flex flex-col items-center gap-1.5 text-xs text-center min-h-[76px] justify-center border-[var(--line)]', active(n.href) && 'border-[var(--accent)] bg-brand-50 dark:bg-brand-950/50')}><Icon name={n.icon} className="h-6 w-6" />{n.label}</Link>)}</div></div>)}</div></Sheet>}
      {search && <Palette onClose={() => setSearch(false)} go={(h) => { setSearch(false); router.push(h); }} />}
    </div>
  );
}

function BottomLink({ n, on }: { n: NavItem; on: boolean }) {
  return <Link href={n.href} aria-current={on ? 'page' : undefined} className={cn('relative flex flex-col items-center justify-center gap-1 py-1.5 min-h-[60px] text-[11px]', on ? 'text-white font-medium' : 'text-white/70')}>{on && <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-[var(--accent)]" aria-hidden />}<Icon name={n.icon} className={cn('h-5 w-5', on && 'text-[var(--accent)]')} /><span>{n.label}</span></Link>;
}

function Sheet({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  const t = useT();
  return (
    <div className="md:hidden fixed inset-0 z-50 bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="absolute bottom-0 inset-x-0 rounded-t-3xl bg-[var(--bg)] p-4 pb-8 safe-bottom animate-rise max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3"><h2 className="font-display text-lg font-semibold tracking-tight">{title}</h2><button onClick={onClose} className="btn-ghost btn-sm" aria-label={t('common.close')}>✕</button></div>{children}
      </div>
    </div>
  );
}

interface Hit { kind: string; label: string; sub?: string; href: string }
function Palette({ onClose, go }: { onClose: () => void; go: (h: string) => void }) {
  const t = useT();
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Hit[]>([]); const [sel, setSel] = useState(0); const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const timer = setTimeout(async () => { try { const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`); setHits(await r.json()); setSel(0); } catch { /* */ } }, 180);
    return () => clearTimeout(timer);
  }, [q]);
  return (
    <div className="fixed inset-0 z-[95] bg-black/40 backdrop-blur-sm flex items-start justify-center p-3 md:pt-24" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t('shell.globalSearch')} className="w-full max-w-xl card overflow-hidden self-start mt-10 md:mt-0 shadow-2xl animate-rise">
        <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('shell.searchPlaceholder')} className="w-full px-4 py-3.5 bg-transparent outline-none border-b border-slate-200 dark:border-slate-700 text-base"
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); } if (e.key === 'Enter' && hits[sel]) go(hits[sel].href); }} />
        <ul className="max-h-[60vh] overflow-y-auto" role="listbox">
          {hits.map((h, i) => <li key={h.href + i} role="option" aria-selected={i === sel}><button className={cn('w-full text-left px-4 py-2.5 flex items-center gap-3 min-h-[48px]', i === sel && 'bg-slate-100 dark:bg-slate-800 shadow-[inset_3px_0_0_var(--accent)]')} onClick={() => go(h.href)} onMouseEnter={() => setSel(i)}><span className="font-mono text-[10px] uppercase tracking-[.1em] text-slate-600 dark:text-slate-400 w-24 shrink-0">{h.kind}</span><span className="truncate">{h.label}</span>{h.sub && <span className="muted text-xs truncate ml-auto">{h.sub}</span>}</button></li>)}
          {q.trim().length >= 2 && !hits.length && <li className="px-4 py-6 text-center muted text-sm">{t('shell.noResults', { q })}</li>}
          {q.trim().length < 2 && <li className="px-4 py-5 muted text-sm">{t('shell.searchHint')}</li>}
        </ul>
      </div>
    </div>
  );
}
