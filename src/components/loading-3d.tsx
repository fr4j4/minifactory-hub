import { cn } from '@/lib/format';

/**
 * Objeto 3D «cargándose»: un cubo que gira mientras sus capas se van imprimiendo de abajo hacia arriba.
 * Solo CSS (sin imágenes ni JS); con movimiento reducido se queda como un cubo quieto.
 */
export function Loading3D({ label, className, size = 'md', hideLabel }: { label: string; className?: string; size?: 'sm' | 'md'; /** solo para lectores de pantalla (cuando el texto ya está al lado) */ hideLabel?: boolean }) {
  const faces = ['front', 'back', 'right', 'left', 'top', 'bottom'] as const;
  return (
    <div role="status" aria-label={label} className={cn('l3d', size === 'sm' && 'l3d-sm', className)}>
      <div className="l3d-stage" aria-hidden>
        <div className="l3d-shadow" />
        <div className="l3d-cube">
          {faces.map((f) => <span key={f} className={cn('l3d-face', `l3d-${f}`)}><i className="l3d-layers" /></span>)}
        </div>
      </div>
      <span className={cn('l3d-label', hideLabel && 'sr-only')}>{label}</span>
    </div>
  );
}
