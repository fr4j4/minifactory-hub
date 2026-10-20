#!/usr/bin/env python3
"""Spike S2: prototipo del generador del esquema de parámetros de OrcaSlicer.
Lee PrintConfig.cpp (definiciones) y Tab.cpp (páginas/grupos de la interfaz) del tag de la versión instalada y el catálogo
OrcaSlicer.mo (es) del AppImage. Solo mide cobertura; la salida completa NO se versiona (AGPL-3.0): se generaría al instalar Orca."""
import re, json, sys, gettext, collections
cpp = open('/tmp/PrintConfig.cpp', encoding='utf-8').read()
tab = open('/tmp/Tab.cpp', encoding='utf-8').read()
mo = gettext.GNUTranslations(open('/home/user/minifactory-hub/.orca/squashfs-root/resources/i18n/es/OrcaSlicer.mo', 'rb'))
tr = lambda s: mo.gettext(s) if s else s
S = lambda m: re.sub(r'"\s*\n\s*"', '', m)  # une literales C++ partidos
def lit(expr):
    m = re.findall(r'"((?:[^"\\]|\\.)*)"', expr); return ''.join(m).replace('\\"', '"').replace('\\n', '\n') if m else None
# --- PrintConfig.cpp
blocks = re.split(r'\n\s*def = this->add(?:_nullable)?\("', '\n' + cpp)[1:]
opts = {}
for b in blocks:
    key = b.split('"', 1)[0]; body = b[:6000]
    end = re.search(r'\n\s*def = this->add|\n\}', body); body = body[: end.start()] if end else body
    g = lambda f: (lit(re.search(r'def->%s\s*=\s*(?:L|_L|_u8L)?\((.*?)\);' % f, body, re.S).group(1)) if re.search(r'def->%s\s*=\s*(?:L|_L|_u8L)?\(' % f, body) else None)
    num = lambda f: (float(re.search(r'def->%s\s*=\s*(-?[\d.]+)' % f, body).group(1)) if re.search(r'def->%s\s*=\s*-?[\d.]+' % f, body) else None)
    mode = re.search(r'def->mode\s*=\s*(com\w+)', body)
    enum = re.findall(r'def->enum_values\.push_back\("([^"]+)"\)', body)
    labels = [lit(x) for x in re.findall(r'def->enum_labels\.push_back\((.*?)\);', body)]
    ty = re.search(r'^(\w+)', b.split('",', 1)[1].strip()) if '",' in b else None
    opts[key] = dict(label=g('label'), tooltip=g('tooltip'), category=g('category'), unit=g('sidetext'), min=num('min'), max=num('max'), mode=(mode.group(1) if mode else 'comAdvanced'), type=(ty.group(1) if ty else None), enum=enum, enum_labels=labels)
n = len(opts); w = lambda f: sum(1 for o in opts.values() if o[f])
print(f'opciones: {n} | con label {w("label")} | tooltip {w("tooltip")} | categoría {w("category")} | unidad {w("unit")} | enum {w("enum")}')
print('modo:', collections.Counter(o['mode'] for o in opts.values()))
es_lab = sum(1 for o in opts.values() if o['label'] and tr(o['label']) != o['label']); es_tip = sum(1 for o in opts.values() if o['tooltip'] and tr(o['tooltip']) != o['tooltip'])
print(f'traducidas al español (por msgid): label {es_lab}/{w("label")} | tooltip {es_tip}/{w("tooltip")}')
# --- Tab.cpp: páginas y grupos
pages = collections.OrderedDict(); cur = None; grp = None; cls = None
for line in tab.split('\n'):
    m = re.search(r'void (Tab\w+)::build\(\)', line)
    if m: cls = m.group(1); continue
    m = re.search(r'add_options_page\(L\("([^"]+)"\)', line)
    if m and cls: cur = (cls, m.group(1)); pages[cur] = collections.OrderedDict(); grp = None; continue
    m = re.search(r'new_optgroup\(L\("([^"]*)"\)', line)
    if m and cur: grp = m.group(1); pages[cur].setdefault(grp, []); continue
    for k in re.findall(r'append_single_option_line\("(\w+)"', line) + re.findall(r'append_option\(.*?"(\w+)"', line):
        if cur and grp is not None: pages[cur][grp].append(k)
by = collections.defaultdict(lambda: [0, 0, 0])
for (c, p), gs in pages.items():
    keys = [k for g in gs.values() for k in g]; by[c][0] += 1; by[c][1] += len(keys); by[c][2] += len(set(keys) & set(opts))
print('Tab -> [páginas, claves en la interfaz, claves con definición]:', dict(by))
ui = {k for gs in pages.values() for g in gs.values() for k in g}
print('claves únicas en la interfaz:', len(ui), '| por modo (simple/avanzado/experto):', collections.Counter(opts[k]['mode'] for k in ui if k in opts))
for (c, p), gs in list(pages.items())[:3]: print(c, '/', p, '->', {g: v[:4] for g, v in list(gs.items())[:3]})
# muestras de claves que usa el sitio hoy
for k in ['layer_height', 'wall_loops', 'sparse_infill_density', 'sparse_infill_pattern', 'enable_support', 'nozzle_temperature', 'filament_flow_ratio']:
    o = opts.get(k, {}); print(k, '|', o.get('label'), '|', tr(o.get('label') or ''), '|', o.get('unit'), o.get('min'), o.get('max'), o.get('mode'), '|', o.get('enum')[:4] if o.get('enum') else '')
json.dump({k: v for k, v in opts.items()}, open('/tmp/s2-full.json', 'w'), ensure_ascii=False)
