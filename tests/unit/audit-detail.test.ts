import { describe, expect, it } from 'vitest';
import { createT } from '@/i18n/translate';
import { setNumberFormat } from '@/lib/format';
import { auditDetail } from '@/lib/audit-detail';

describe('auditDetail', () => {
  it('traduce campos y valores, formatea montos y oculta identificadores', () => {
    setNumberFormat('en-US', 'USD');
    const t = createT('en');
    expect(auditDetail({ final: null, total: 4000, stage: 'producto_final', orderId: '00000000-0000-4000-8000-000000000001', hadPrinterLink: true }, t))
      .toBe(`final: — · total: $4,000.00 · stage: ${t('gallery.stage.producto_final')} · had a linked printer: yes`);
    expect(auditDetail(['featured', 'tags'], t)).toBe('featured, tags');
    setNumberFormat('es-CL', 'CLP');
  });
});
