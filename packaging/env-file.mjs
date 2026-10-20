// Lee config.env: líneas CLAVE=valor. «#» abre un comentario solo al inicio de la línea o tras un espacio,
// nunca dentro de comillas. Las comillas que rodean el valor se quitan. La prueba está en packaging/smoke.mjs.
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2];
    const end = v[0] === '"' || v[0] === "'" ? v.indexOf(v[0], 1) : -1;
    v = end > 0 ? v.slice(1, end) : v.replace(/(^|\s)#.*$/, '').trim();
    out[m[1]] = v;
  }
  return out;
}
