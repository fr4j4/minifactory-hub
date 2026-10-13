/** Permisos por rol y módulo (matriz por defecto, sección 21 de la spec). V=ver C=crear E=editar X=eliminar */
export type Role = 'admin' | 'operador' | 'ventas';
export type Module =
  | 'pedidos' | 'presupuestos' | 'clientes' | 'archivos' | 'laminador' | 'catalogo' | 'ventas'
  | 'inventario' | 'maquinas' | 'cola' | 'galeria' | 'pagos' | 'reportes' | 'config' | 'ia';
export type Action = 'V' | 'C' | 'E' | 'X';

const ALL = 'VCEX';
export const DEFAULT_MATRIX: Record<Role, Record<Module, string>> = {
  admin: Object.fromEntries(['pedidos','presupuestos','clientes','archivos','laminador','catalogo','ventas','inventario','maquinas','cola','galeria','pagos','reportes','config','ia'].map((m) => [m, ALL])) as Record<Module, string>,
  operador: { pedidos: 'VCE', presupuestos: 'V', clientes: 'V', archivos: 'VCE', laminador: 'VCE', catalogo: 'VCE', ventas: 'VC', inventario: 'VCE', maquinas: 'VCE', cola: 'VCE', galeria: 'VCE', pagos: 'V', reportes: '', config: '', ia: 'VC' },
  ventas: { pedidos: 'VCE', presupuestos: 'VCE', clientes: 'VCE', archivos: 'VCE', laminador: 'V', catalogo: 'V', ventas: 'VCE', inventario: 'V', maquinas: 'V', cola: 'V', galeria: 'VCE', pagos: 'VCE', reportes: 'V', config: '', ia: 'VC' },
};

export interface PermUser { role: Role; permOverrides?: Record<string, string> | null }

export function can(user: PermUser | null | undefined, mod: Module, action: Action = 'V'): boolean {
  if (!user) return false;
  const ov = user.permOverrides?.[mod];
  const allowed = ov !== undefined ? ov : DEFAULT_MATRIX[user.role]?.[mod] ?? '';
  return allowed.includes(action);
}
/** Ver costos y márgenes: Administrador y Ventas (de lo que cotiza). El Operador nunca. */
export const canSeeCosts = (u: PermUser | null | undefined) => !!u && (u.role === 'admin' || u.role === 'ventas');
export const canSetFinalPrice = (u: PermUser | null | undefined) => !!u && (u.role === 'admin' || u.role === 'ventas');
export const canSellBelowCost = (u: PermUser | null | undefined) => !!u && u.role === 'admin';
export const ROLE_LABEL: Record<Role, string> = { admin: 'Administrador', operador: 'Operador', ventas: 'Ventas' };
