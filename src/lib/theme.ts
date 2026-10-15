/** ¿La interfaz está en oscuro ahora? Respeta la elección manual (`data-theme`) y, si no hay, la del sistema. Solo en el navegador. */
export function isDarkNow(): boolean {
  const t = document.documentElement.getAttribute('data-theme');
  if (t === 'dark') return true; if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
