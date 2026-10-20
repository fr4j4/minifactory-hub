#!/usr/bin/env bash
# CI (Ubuntu con systemd): instala el .deb y prueba el servicio aislado de verdad.
# Con las mismas propiedades de aislamiento que la unidad, comprueba que Chrome genera un PDF
# con el Playwright de la app y que OrcaSlicer, instalado como dice la guía, arranca.
set -euo pipefail
deb="$(ls dist/*.deb)"
journal() { sudo journalctl -u minifactory-hub --no-pager; }
wait_up() { for _ in $(seq 1 60); do curl -fs -o /dev/null http://127.0.0.1:3000/bienvenida && return 0; sleep 2; done; journal | tail -50; return 1; }

sudo apt-get install -y "./$deb"
wait_up
systemctl is-active minifactory-hub
grep -q 'ingresa este código' <<<"$(journal)"
[ "$(sudo stat -c %a /var/lib/minifactory-hub)" = 700 ]

# OrcaSlicer: librerías que pide install-orca.sh y la instalación indicada en docs/empaquetado-releases.md.
sudo apt-get install -y --no-install-recommends libopengl0 libglu1-mesa libwebkit2gtk-4.1-0 libgl1 libmspack0
# El script termina con «AppRun --help | head -1»: con pipefail puede salir con SIGPIPE ya instalado; se comprueba el binario.
sudo -u minifactory ORCA_DIR=/var/lib/minifactory-hub/orca bash /opt/minifactory-hub/install-orca.sh || true
sudo test -x /var/lib/minifactory-hub/orca/squashfs-root/AppRun
sudo systemctl restart minifactory-hub
wait_up
grep -q 'OrcaSlicer: /var/lib/minifactory-hub/orca/squashfs-root/AppRun' <<<"$(journal)"

# Mismo aislamiento que el servicio: las propiedades se leen de la unidad instalada (sin copiarlas aquí).
mapfile -t props < <(grep -E '^(User|Group|Environment|NoNewPrivileges|Protect[A-Za-z]+|PrivateTmp|ReadWritePaths)=' /lib/systemd/system/minifactory-hub.service)
inside() { sudo systemd-run --wait --pipe --quiet "${props[@]/#/--property=}" --property=WorkingDirectory=/opt/minifactory-hub/app -- "$@"; }
pdf_js='require("playwright").chromium.launch({ executablePath: "/usr/bin/google-chrome", args: ["--no-sandbox"] }).then(async (b) => {
  const p = await b.newPage(); await p.setContent("<h1>MiniFactory</h1>"); const pdf = await p.pdf(); await b.close();
  if (pdf.length < 500) throw new Error("PDF vacío"); console.log("PDF:", pdf.length, "bytes");
})'
grep -q OrcaSlicer <<<"$(inside /var/lib/minifactory-hub/orca/squashfs-root/AppRun --help 2>&1 || true)"
echo "OrcaSlicer arranca dentro del aislamiento"
inside /opt/minifactory-hub/node/bin/node -e "$pdf_js"

sudo apt-get remove -y minifactory-hub
if systemctl is-active --quiet minifactory-hub; then echo 'el servicio sigue activo tras desinstalar'; exit 1; fi
sudo test -f /var/lib/minifactory-hub/session-secret
echo "SERVICIO OK: systemd aislado, /bienvenida 200, PDF con Chrome y OrcaSlicer dentro del sandbox, datos conservados al desinstalar"
