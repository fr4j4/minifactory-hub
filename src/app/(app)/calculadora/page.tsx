import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts, canSetFinalPrice } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { QuickCalc } from '@/components/quick-calc';
import { loadEditorData } from '@/lib/editor-data';

export const metadata = { title: 'Calculadora rápida' };
export default async function CalcPage() {
  const user = await pagePerm('presupuestos', 'V'); const { ctx, models } = await loadEditorData();
  return (<><PageHeader title="Calculadora rápida" subtitle="Para consultas por WhatsApp: calcula el precio sin crear un presupuesto." />
    <QuickCalc ctx={ctx} models={models} showCosts={canSeeCosts(user)} canPrice={canSetFinalPrice(user)} canCreate={can(user, 'presupuestos', 'C')} whatsappTpl="" /></>);
}
