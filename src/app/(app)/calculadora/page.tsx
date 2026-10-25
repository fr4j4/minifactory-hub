import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts, canSetFinalPrice } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { QuickCalc } from '@/components/quick-calc';
import { loadEditorData } from '@/lib/editor-data';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.calculator') }; }
export default async function CalcPage() {
  const t = await getT();
  const user = await pagePerm('presupuestos', 'V'); const { ctx, models, customers } = await loadEditorData(user);
  return (<><PageHeader title={t('calculator.quickCalculator')} subtitle={t('calculator.forWhatsappInquiriesCalculateThe')} />
    <QuickCalc ctx={ctx} models={models} customers={customers} showCosts={canSeeCosts(user)} canPrice={canSetFinalPrice(user)} canCreate={can(user, 'presupuestos', 'C')} level={user.calcLevel} /></>);
}
