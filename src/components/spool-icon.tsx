import { cn } from '@/lib/format';
import { inkFor, rollRadius } from '@/lib/spool-geometry';

/**
 * Carrete dibujado con el color real del filamento y el tipo de material escrito encima (PLA, PETG…), para reconocer cada fila de un vistazo
 * sin depender de una foto. `fill` (0 a 1) es cuánto filamento queda; sin él se dibuja lleno. La resina se dibuja como botella.
 */
export function SpoolIcon({ hex, label, fill = 1, resin = false, size = 44, className }: { hex: string; label?: string; fill?: number; resin?: boolean; size?: number; className?: string }) {
  const f = Math.max(0.12, Math.min(1, fill)); const ink = inkFor(hex);
  const text = (label ?? '').slice(0, 5).toUpperCase();
  if (resin) {
    const h = 30 * f;
    return (
      <svg viewBox="0 0 48 48" width={size} height={size} className={cn('shrink-0', className)} role="img" aria-label={label}>
        <rect x="14" y="4" width="20" height="7" rx="2" fill="#475569" />
        <path d="M12 14a3 3 0 0 1 3-3h18a3 3 0 0 1 3 3v28a3 3 0 0 1-3 3H15a3 3 0 0 1-3-3Z" fill="#e2e8f0" opacity=".55" stroke="#64748b" strokeWidth="1.2" />
        <rect x="13.2" y={43.8 - h} width="21.6" height={h} rx="2" fill={hex} stroke="rgba(0,0,0,.25)" strokeWidth=".6" />
        <text x="24" y="30" textAnchor="middle" fontSize="8" fontWeight="700" fill={ink} style={{ fontFamily: 'var(--font-mono, monospace)' }}>{text || 'RES'}</text>
      </svg>
    );
  }
  // el rollo ocupa entre el núcleo (r=7) y el borde del plato (r=19)
  const r = rollRadius(fill);
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} className={cn('shrink-0', className)} role="img" aria-label={label}>
      <circle cx="24" cy="24" r="21" fill="#334155" />
      <circle cx="24" cy="24" r="19.5" fill="none" stroke="rgba(255,255,255,.18)" strokeWidth="1" />
      <circle cx="24" cy="24" r={r} fill={hex} stroke="rgba(0,0,0,.28)" strokeWidth=".8" />
      <circle cx="24" cy="24" r={r - 2.2} fill="none" stroke="rgba(0,0,0,.14)" strokeWidth=".7" />
      <circle cx="24" cy="24" r={Math.max(8, r - 5)} fill="none" stroke="rgba(255,255,255,.18)" strokeWidth=".7" />
      <circle cx="24" cy="24" r="6.4" fill="#1e293b" />
      <circle cx="24" cy="24" r="3.2" fill="#0f172a" stroke="rgba(255,255,255,.2)" strokeWidth=".6" />
      <rect x="13" y="20.4" width="22" height="7.2" rx="2" fill={hex} stroke="rgba(0,0,0,.35)" strokeWidth=".7" />
      <text x="24" y="25.6" textAnchor="middle" fontSize="6.4" fontWeight="700" fill={ink} style={{ fontFamily: 'var(--font-mono, monospace)' }}>{text}</text>
    </svg>
  );
}
