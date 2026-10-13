'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/format';
import { logoutAction } from '@/actions/auth';

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

export function AppShell({ nav, user, unread, children }: { nav: NavItem[]; user: { name: string; role: string }; unread: number; children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter();
  const [more, setMore] = useState(false); const [plus, setPlus] = useState(false); const [search, setSearch] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => { setMore(false); setPlus(false); }, [path]);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setSearch(true); } if (e.key === 'Escape') { setSearch(false); setMore(false); setPlus(false); } };
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h);
  }, []);
  const active = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(href + '/'));
  const bottom = ['/', '/pedidos', '/cola', '/inventario'].map((h) => nav.find((n) => n.href === h)).filter(Boolean) as NavItem[];
  const quick = [
    { href: '/pedidos/nuevo', label: 'Nuevo pedido', icon: 'orders' }, { href: '/ventas/nueva', label: 'Venta rápida', icon: 'cart' },
    { href: '/presupuestos/nuevo', label: 'Nuevo presupuesto', icon: 'quote' }, { href: '/calculadora', label: 'Calculadora rápida', icon: 'calc' },
    { href: '/galeria?subir=1', label: 'Subir foto', icon: 'camera' }, { href: '/inventario/escanear', label: 'Escanear QR', icon: 'qr' },
  ];
  const Item = ({ n, rail }: { n: NavItem; rail?: boolean }) => (
    <Link href={n.href} aria-current={active(n.href) ? 'page' : undefined} title={n.label}
      className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm min-h-[44px] md:min-h-[38px]', active(n.href) ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100 font-medium' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800')}>
      <Icon name={n.icon} />{!rail && <span className="xl:inline hidden md:hidden">{n.label}</span>}{!rail && <span className="md:hidden xl:hidden">{n.label}</span>}
    </Link>
  );
  return (
    <div className="min-h-screen md:flex">
      {/* barra lateral: riel con íconos en tablet, completa en escritorio */}
      <aside className={cn('hidden md:flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0e1527] sticky top-0 h-screen shrink-0 transition-all', collapsed ? 'md:w-[68px]' : 'md:w-[68px] xl:w-60')} aria-label="Navegación principal">
        <div className="flex items-center gap-2.5 px-3 h-14 border-b border-slate-200 dark:border-slate-800"><img src="/icon.svg" alt="" width={32} height={32} className="rounded-lg" /><span className={cn('font-semibold hidden', collapsed ? '' : 'xl:inline')}>MiniFactory</span></div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined} title={n.label}
              className={cn('flex items-center gap-3 rounded-lg px-3 py-2 text-sm min-h-[40px]', active(n.href) ? 'bg-brand-50 text-brand-800 dark:bg-brand-900/40 dark:text-brand-100 font-medium' : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800')}>
              <Icon name={n.icon} /><span className={cn('hidden', collapsed ? '' : 'xl:inline')}>{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="p-2 border-t border-slate-200 dark:border-slate-800 hidden xl:block"><button className="btn-ghost btn-sm w-full" onClick={() => setCollapsed((c) => !c)}>{collapsed ? '»' : '« Plegar'}</button></div>
      </aside>
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="sticky top-0 z-30 h-14 bg-white/90 dark:bg-[#0e1527]/90 backdrop-blur border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 px-3 md:px-6 no-print">
          <img src="/icon.svg" alt="" width={28} height={28} className="rounded-lg md:hidden" />
          <button onClick={() => setSearch(true)} className="flex-1 max-w-xl flex items-center gap-2 rounded-lg border border-slate-300 dark:border-slate-700 px-3 text-sm muted min-h-[40px] text-left" aria-label="Buscar (Ctrl+K)">
            <Icon name="search" className="h-4 w-4" /><span className="truncate">Buscar clientes, pedidos, archivos, bobinas…</span><kbd className="ml-auto hidden md:inline text-[11px] border rounded px-1.5 py-0.5 border-slate-300 dark:border-slate-600">Ctrl K</kbd>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <Link href="/notificaciones" className="btn-ghost btn-sm relative !px-2.5" aria-label={`Notificaciones${unread ? ` (${unread} sin leer)` : ''}`}><Icon name="bell" className="h-5 w-5" />{unread > 0 && <span className="absolute -top-1 -right-1 h-5 min-w-5 px-1 rounded-full bg-red-600 text-white text-[11px] grid place-items-center">{unread}</span>}</Link>
            <details className="relative">
              <summary className="btn-ghost btn-sm list-none cursor-pointer !px-2.5"><span className="hidden sm:inline max-w-[140px] truncate">{user.name}</span><span className="sm:hidden">👤</span></summary>
              <div className="absolute right-0 mt-1 w-56 card p-2 z-40">
                <div className="px-2 py-1.5 text-xs muted">{user.name} · {user.role}</div>
                <Link href="/configuracion/perfil" className="block rounded px-2 py-3 min-h-[44px] text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Mi perfil y avisos</Link>
                <form action={logoutAction}><button className="w-full text-left rounded px-2 py-3 min-h-[44px] text-sm hover:bg-slate-100 dark:hover:bg-slate-800">Cerrar sesión</button></form>
              </div>
            </details>
          </div>
        </header>
        <main id="contenido" className="flex-1 p-3 sm:p-4 md:p-6 pb-28 md:pb-8 max-w-[1500px] w-full mx-auto">{children}</main>
      </div>
      {/* barra inferior móvil */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white dark:bg-[#0e1527] border-t border-slate-200 dark:border-slate-800 grid grid-cols-5 safe-bottom no-print" aria-label="Navegación móvil">
        {bottom.slice(0, 2).map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined} className={cn('flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[56px] text-[11px]', active(n.href) ? 'text-brand-700 dark:text-brand-300 font-medium' : 'muted')}><Icon name={n.icon} /><span>{n.label}</span></Link>)}
        <div className="grid place-items-center"><button onClick={() => setPlus((p) => !p)} aria-label="Acciones rápidas" aria-expanded={plus} className="h-12 w-12 -mt-5 rounded-full bg-brand-600 text-white grid place-items-center shadow-lg"><Icon name="plus" className="h-6 w-6" /></button></div>
        {bottom.slice(2).map((n) => <Link key={n.href} href={n.href} aria-current={active(n.href) ? 'page' : undefined} className={cn('flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[56px] text-[11px]', active(n.href) ? 'text-brand-700 dark:text-brand-300 font-medium' : 'muted')}><Icon name={n.icon} /><span>{n.label}</span></Link>)}
        <button onClick={() => setMore(true)} className="flex flex-col items-center justify-center gap-0.5 py-1.5 min-h-[56px] text-[11px] muted col-start-5 row-start-1" aria-label="Más secciones"><Icon name="menu" /><span>Más</span></button>
      </nav>
      {plus && <Sheet onClose={() => setPlus(false)} title="Acciones rápidas"><div className="grid grid-cols-2 gap-2">{quick.map((q) => <Link key={q.href} href={q.href} className="card p-4 flex flex-col items-center gap-2 text-sm min-h-[88px] justify-center"><Icon name={q.icon} className="h-6 w-6 text-brand-600" />{q.label}</Link>)}</div></Sheet>}
      {more && <Sheet onClose={() => setMore(false)} title="Todas las secciones"><div className="grid grid-cols-3 gap-2">{nav.map((n) => <Link key={n.href} href={n.href} className={cn('rounded-xl border p-3 flex flex-col items-center gap-1.5 text-xs text-center min-h-[76px] justify-center border-slate-200 dark:border-slate-700', active(n.href) && 'bg-brand-50 dark:bg-brand-900/40')}><Icon name={n.icon} className="h-6 w-6" />{n.label}</Link>)}</div></Sheet>}
      {/* botón + en escritorio */}
      <div className="hidden md:block fixed bottom-6 right-6 z-40 no-print">
        <button onClick={() => setPlus((p) => !p)} className="btn-primary shadow-lg !rounded-full !px-4" aria-expanded={plus}><Icon name="plus" className="h-5 w-5" /> Nuevo</button>
        {plus && <div className="absolute bottom-14 right-0 card p-1.5 w-56 shadow-xl">{quick.map((q) => <Link key={q.href} href={q.href} className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-800"><Icon name={q.icon} className="h-4 w-4" />{q.label}</Link>)}</div>}
      </div>
      {search && <Palette onClose={() => setSearch(false)} go={(h) => { setSearch(false); router.push(h); }} />}
    </div>
  );
}

function Sheet({ children, title, onClose }: { children: React.ReactNode; title: string; onClose: () => void }) {
  return (
    <div className="md:hidden fixed inset-0 z-50 bg-black/50" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="absolute bottom-0 inset-x-0 rounded-t-2xl bg-white dark:bg-[#121a2e] p-4 pb-8 safe-bottom">
        <div className="flex items-center justify-between mb-3"><h2 className="font-semibold">{title}</h2><button onClick={onClose} className="btn-ghost btn-sm" aria-label="Cerrar">✕</button></div>{children}
      </div>
    </div>
  );
}

interface Hit { kind: string; label: string; sub?: string; href: string }
function Palette({ onClose, go }: { onClose: () => void; go: (h: string) => void }) {
  const [q, setQ] = useState(''); const [hits, setHits] = useState<Hit[]>([]); const [sel, setSel] = useState(0); const inp = useRef<HTMLInputElement>(null);
  useEffect(() => { inp.current?.focus(); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => { try { const r = await fetch(`/api/search?q=${encodeURIComponent(q)}`); setHits(await r.json()); setSel(0); } catch { /* */ } }, 180);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <div className="fixed inset-0 z-[95] bg-black/50 flex items-start justify-center p-3 md:pt-24" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Búsqueda global" className="w-full max-w-xl card overflow-hidden self-start mt-10 md:mt-0">
        <input ref={inp} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre, número, SKU, código de bobina…" className="w-full px-4 py-3.5 bg-transparent outline-none border-b border-slate-200 dark:border-slate-700 text-base"
          onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(hits.length - 1, s + 1)); } if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(0, s - 1)); } if (e.key === 'Enter' && hits[sel]) go(hits[sel].href); }} />
        <ul className="max-h-[60vh] overflow-y-auto" role="listbox">
          {hits.map((h, i) => <li key={h.href + i} role="option" aria-selected={i === sel}><button className={cn('w-full text-left px-4 py-2.5 flex items-center gap-3 min-h-[48px]', i === sel && 'bg-slate-100 dark:bg-slate-800')} onClick={() => go(h.href)} onMouseEnter={() => setSel(i)}><span className="badge bg-slate-100 dark:bg-slate-800 border-transparent w-24 justify-center shrink-0">{h.kind}</span><span className="truncate">{h.label}</span>{h.sub && <span className="muted text-xs truncate ml-auto">{h.sub}</span>}</button></li>)}
          {q.trim().length >= 2 && !hits.length && <li className="px-4 py-6 text-center muted text-sm">Sin resultados para “{q}”</li>}
          {q.trim().length < 2 && <li className="px-4 py-5 muted text-sm">Escribe al menos 2 letras. Busca en clientes, pedidos, presupuestos, productos, archivos y bobinas.</li>}
        </ul>
      </div>
    </div>
  );
}
