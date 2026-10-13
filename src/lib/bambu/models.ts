/**
 * Modelos de Bambu Lab según el código que anuncian por SSDP (cabecera DevModel.bambu.com) y en el
 * número de serie. La cámara cambia por familia: X1/H2 exponen RTSPS en el puerto 322; P1/A1 entregan
 * JPEG sueltos por TLS en el puerto 6000.
 */
export type CameraKind = 'rtsps' | 'jpeg-tls' | 'none';
export interface BambuModel { code: string; name: string; family: 'X1' | 'P1' | 'A1' | 'H2'; camera: CameraKind; vol: [number, number, number]; enclosed: boolean; orcaMachine: string; amsSlots: number }

const MODELS: BambuModel[] = [
  { code: '3DPrinter-X1-Carbon', name: 'X1 Carbon', family: 'X1', camera: 'rtsps', vol: [256, 256, 256], enclosed: true, orcaMachine: 'Bambu Lab X1 Carbon 0.4 nozzle', amsSlots: 16 },
  { code: 'BL-P001', name: 'X1 Carbon', family: 'X1', camera: 'rtsps', vol: [256, 256, 256], enclosed: true, orcaMachine: 'Bambu Lab X1 Carbon 0.4 nozzle', amsSlots: 16 },
  { code: '3DPrinter-X1', name: 'X1', family: 'X1', camera: 'rtsps', vol: [256, 256, 256], enclosed: true, orcaMachine: 'Bambu Lab X1 0.4 nozzle', amsSlots: 16 },
  { code: 'BL-P002', name: 'X1', family: 'X1', camera: 'rtsps', vol: [256, 256, 256], enclosed: true, orcaMachine: 'Bambu Lab X1 0.4 nozzle', amsSlots: 16 },
  { code: 'C13', name: 'X1E', family: 'X1', camera: 'rtsps', vol: [256, 256, 256], enclosed: true, orcaMachine: 'Bambu Lab X1E 0.4 nozzle', amsSlots: 16 },
  { code: 'C11', name: 'P1P', family: 'P1', camera: 'jpeg-tls', vol: [256, 256, 256], enclosed: false, orcaMachine: 'Bambu Lab P1P 0.4 nozzle', amsSlots: 16 },
  { code: 'C12', name: 'P1S', family: 'P1', camera: 'jpeg-tls', vol: [256, 256, 256], enclosed: true, orcaMachine: 'Bambu Lab P1S 0.4 nozzle', amsSlots: 16 },
  { code: 'N2S', name: 'A1', family: 'A1', camera: 'jpeg-tls', vol: [256, 256, 256], enclosed: false, orcaMachine: 'Bambu Lab A1 0.4 nozzle', amsSlots: 4 },
  { code: 'N1', name: 'A1 mini', family: 'A1', camera: 'jpeg-tls', vol: [180, 180, 180], enclosed: false, orcaMachine: 'Bambu Lab A1 mini 0.4 nozzle', amsSlots: 4 },
  { code: 'O1D', name: 'H2D', family: 'H2', camera: 'rtsps', vol: [350, 320, 325], enclosed: true, orcaMachine: 'Bambu Lab H2D 0.4 nozzle', amsSlots: 16 },
];

/** Prefijos de número de serie por modelo (los tres primeros caracteres). */
const SERIAL_PREFIX: Record<string, string> = { '00M': 'BL-P001', '00W': 'BL-P002', '03W': 'C13', '01S': 'C11', '01P': 'C12', '039': 'N2S', '030': 'N1', '094': 'O1D' };

export function modelFromCode(code?: string | null, serial?: string | null): BambuModel | null {
  const c = code?.trim();
  return MODELS.find((m) => m.code === c) ?? (serial ? MODELS.find((m) => m.code === SERIAL_PREFIX[serial.slice(0, 3)]) ?? null : null);
}
export const MODEL_OPTIONS = MODELS.filter((m, i, a) => a.findIndex((x) => x.name === m.name) === i);
