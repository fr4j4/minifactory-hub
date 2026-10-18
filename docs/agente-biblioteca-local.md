# Agente opcional de carpetas del computador

`scripts/library-agent.py` publica una raíz elegida como WebDAV de solo lectura. Permite catalogar un computador distinto del servidor sin montar sus carpetas en Docker. Requiere Python 3; no instala un servicio ni modifica el sistema.

```bash
export LIBRARY_AGENT_PASSWORD='una-clave-aleatoria-larga-y-exclusiva'
python3 scripts/library-agent.py --root /ruta/a/modelos --listen 127.0.0.1 --port 8766
```

Conectar mediante túnel SSH o un proxy HTTPS. En el Hub configurar una fuente WebDAV, usuario `agent`, contraseña del agente y endpoint accesible desde el servidor. La escucha por defecto solo acepta conexiones locales; `--listen` permite elegir expresamente otra interfaz. El conector puede usar HTTP en una red privada autorizada, pero transporta la clave sin cifrar: el túnel o HTTPS protege ese tramo.

El agente permite listado y lectura; no renombra, elimina ni recibe archivos. La fuente debe permanecer en solo lectura. No sigue enlaces simbólicos ni muestra rutas ocultas; no recorre fuera de la raíz. El recorrido periódico del Hub detecta cambios y la descarga valida revisión y tamaño. Las carpetas sincronizadas con placeholders siguen dependiendo del cliente de nube del sistema.

La ejecución persistente y las actualizaciones del script quedan bajo el administrador del computador. El script no concede acceso automático a otros equipos ni necesita una cuenta de proveedor de IA.
