import { describe, expect, it } from 'vitest';
import { buildExtraParams, parsePresetLists, parsePrintConfig } from '@/lib/slicer/schema/generate';
import { extendSchema, PARAM_BY_KEY, schemaVersion, validateValue } from '@/lib/slicer/schema';

const CPP = `
    def = this->add("layer_height", coFloat);
    def->label = L("Layer height");
    def->category = L("Quality");
    def->tooltip = L("Slicing height for each layer.");
    def->sidetext = L("mm");	// millimeters
    def->min = 0;
    def->set_default_value(new ConfigOptionFloat(0.2));

    def = this->add("ironing_speed", coFloat);
    def->label = L("Ironing speed");
    def->category = L("Quality");
    def->tooltip = L("Print speed of ironing lines");
    def->sidetext = L("mm/s");
    def->min = 1;
    def->max = 500;

    def = this->add("nozzle_temperature_initial_layer", coInts);
    def->label = L("First layer");
    def->tooltip = L("Nozzle temperature for the first layer.");
    def->sidetext = L(u8"\\u2103" /* °C */);
    def->min = 0;
    def->max = 500;

    def = this->add("ironing_pattern", coEnum);
    def->label = L("Ironing pattern");
    def->enum_values.push_back("concentric");
    def->enum_values.push_back("zig-zag");

    def = this->add("gcode_label_objects", coBool);
    def->label = L("Label objects");

    def = this->add("printable_area", coPoints);
    def->label = L("Printable area");
`;
const PRESET = `
static std::vector<std::string> s_Preset_print_options { "layer_height", "ironing_speed", "ironing_pattern", /* "x", */ "gcode_label_objects" };
static std::vector<std::string> s_Preset_filament_options {"nozzle_temperature_initial_layer"};
static std::vector<std::string> s_Preset_machine_limits_options { "machine_max_speed_x" };
static std::vector<std::string> s_Preset_printer_options { "printable_area" };
`;

describe('esquema ampliado desde OrcaSlicer', () => {
  it('lee etiqueta, ayuda, unidad, rangos y opciones', () => {
    const o = parsePrintConfig(CPP); const by = Object.fromEntries(o.map((x) => [x.key, x]));
    expect(by.layer_height).toMatchObject({ coType: 'coFloat', label: 'Layer height', category: 'Quality', sidetext: 'mm', min: 0 });
    expect(by.ironing_speed).toMatchObject({ min: 1, max: 500, sidetext: 'mm/s' });
    expect(by.nozzle_temperature_initial_layer.sidetext).toBe('°C'); expect(by.ironing_pattern.enums).toEqual(['concentric', 'zig-zag']);
  });
  it('separa las claves por tipo de perfil, ignora los comentarios del C++', () => {
    const l = parsePresetLists(PRESET);
    expect([...l.process]).toEqual(['layer_height', 'ironing_speed', 'ironing_pattern', 'gcode_label_objects']); expect([...l.filament]).toEqual(['nozzle_temperature_initial_layer']); expect([...l.machine].sort()).toEqual(['machine_max_speed_x', 'printable_area']);
  });
  it('solo agrega lo que el esquema curado no cubre, y descarta tipos no editables', () => {
    const extra = buildExtraParams(parsePrintConfig(CPP), parsePresetLists(PRESET), new Set(['process:layer_height']));
    expect(extra.map((p) => `${p.type}:${p.key}`).sort()).toEqual(['filament:nozzle_temperature_initial_layer', 'process:gcode_label_objects', 'process:ironing_pattern', 'process:ironing_speed']);
    expect(extra.find((p) => p.key === 'ironing_pattern')).toMatchObject({ kind: 'select', options: ['concentric', 'zig-zag'], page: 'extra', mode: 'expert' });
  });
  it('extendSchema suma las claves, valida rangos y es idempotente', () => {
    const extra = buildExtraParams(parsePrintConfig(CPP), parsePresetLists(PRESET), new Set(['process:layer_height']));
    const fresh = extra.filter((p) => !PARAM_BY_KEY.has(`${p.type}:${p.key}`)).length; expect(fresh).toBeGreaterThan(0);
    const v0 = schemaVersion; expect(extendSchema(extra)).toBe(fresh); expect(schemaVersion).toBe(v0 + 1); expect(extendSchema(extra)).toBe(0);
    expect(PARAM_BY_KEY.get('process:gcode_label_objects')?.kind).toBe('bool'); expect(PARAM_BY_KEY.get('process:ironing_pattern')?.options).toBeTruthy();
  });
});
