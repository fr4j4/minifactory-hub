/** Plantillas de mensaje con variables {cliente} {numero} {total} {vigencia} {seguimiento}. */
export function fillTemplate(t: string, v: Record<string, string | number | null | undefined>) {
  return t.replace(/\{(\w+)\}/g, (_, k) => String(v[k] ?? ''));
}
export function waLink(phone: string | null | undefined, text: string) {
  const digits = (phone ?? '').replace(/[^\d]/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
