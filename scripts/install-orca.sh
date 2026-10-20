#!/usr/bin/env bash
# Descarga OrcaSlicer (AppImage oficial), lo extrae en .orca/ y deja listo el CLI sin pantalla.
# Uso: bash scripts/install-orca.sh [version]   (por defecto 2.4.2)
set -euo pipefail
VERSION="${1:-2.4.2}"
DEST="${ORCA_DIR:-$(cd "$(dirname "$0")/.." && pwd)/.orca}"
if [ -x "$DEST/squashfs-root/AppRun" ] && "$DEST/squashfs-root/AppRun" --help 2>/dev/null | grep -q "OrcaSlicer-$VERSION"; then
  echo "OrcaSlicer $VERSION ya está instalado en $DEST"; exit 0
fi
mkdir -p "$DEST"; cd "$DEST"
NAME="OrcaSlicer_Linux_AppImage_Ubuntu2404_V${VERSION}.AppImage"
echo "Descargando $NAME …"
curl -fSL -o orca.AppImage "https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v${VERSION}/${NAME}"
chmod +x orca.AppImage
rm -rf squashfs-root
./orca.AppImage --appimage-extract >/dev/null
rm -f orca.AppImage
echo "Instalado en $DEST/squashfs-root"
# Librerías de sistema que necesita el binario (Debian/Ubuntu):
if command -v dpkg >/dev/null; then
  missing=""
  for p in libopengl0 libglu1-mesa libwebkit2gtk-4.1-0 libgtk-3-0t64 libgl1 libmspack0; do dpkg -s "$p" >/dev/null 2>&1 || missing="$missing $p"; done
  [ -n "$missing" ] && echo "Faltan paquetes del sistema:$missing  →  apt-get install -y$missing"
fi
"$DEST/squashfs-root/AppRun" --help 2>&1 | head -1
# Esquema ampliado de parámetros del Estudio (texto de OrcaSlicer, AGPL: se genera aquí y no se versiona). Sin red, se usa el curado.
(cd "$(dirname "$0")/.." && npx --no-install tsx scripts/gen-orca-schema.ts) || true
