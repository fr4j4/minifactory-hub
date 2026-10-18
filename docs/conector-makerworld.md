# Conector MakerWorld e importación con revisión previa

Fecha: 2026-10-18. Rama: `feature/biblioteca-3d-multifuente`.
Destino exclusivo: `minifactory-library-test`, puerto 3011, base `library_test`.

## Hallazgo y decisión

El endpoint aportado por el usuario, `/api/v1/design-service/instance/3766961/f3mf?type=download&fileType=&devModelName=BL-P001`, resuelve un enlace de archivo mediante JSON. El servidor recibió HTTP 403 con desafío web desde makerworld.com. La ruta equivalente en api.bambulab.com respondió HTTP 403 con `Please log in to download models.`. Son dos condiciones diferentes: protección de la web y autenticación de la descarga. La sesión del navegador no se transfiere al servidor de MiniFactory.

Se implementó un conector propio para cuentas globales de Bambu/MakerWorld. No se presenta como SDK oficial ni como OAuth aprobado. No se confirmó documentación oficial pública y utilizable para este flujo. El cliente Bambu existente en el repositorio ya documentaba las rutas de contraseña, código por correo y segundo factor; el nuevo conector usa orígenes fijos e independientes de la configuración y credenciales de impresoras.

## Alternativas evaluadas

| Vía | Implementación / límite |
| --- | --- |
| Metadatos públicos | API de Bambu, sin iniciar sesión. Modelo, autor, licencia, portada, descripción y perfiles. |
| Correo y contraseña | Inicio de sesión explícito desde el diálogo. La contraseña no se persiste. |
| Código por correo | Cuando Bambu solicita verificación, se envía el código y el diálogo pide introducirlo. |
| App autenticadora | Intercambio CSRF y código 2FA. Desafío cifrado, ligado al usuario y válido durante cinco minutos. |
| Token de sesión existente | Alternativa para SSO y acceso completado en navegador. Se valida contra las preferencias del usuario antes de guardarlo. |
| JSON o URL temporal | Pegar la respuesta de descarga obtenida en el navegador. Admite `{url,name}`, `{data:{url,name}}` o URL HTTPS directa. |
| Archivo descargado manualmente | Sigue disponible la subida normal y asociación de origen desde la biblioteca. |
| Sesión/cookies del navegador | No se extraen automáticamente ni se comparte la sesión con el servidor. Se ofrece copia explícita del token. |
| CAPTCHA, acceso de pago o permisos insuficientes | No se eluden. Se completa el acceso autorizado en el sitio y se usa token, enlace o subida manual. |
| OAuth oficial | No implementado: falta un contrato de integración confirmado y registro de aplicación aplicable. |
| Cuentas de región China | No soportadas por este conector; no se da por equivalente el servicio regional. |

## Uso

1. Abrir **Archivos → Importar por URL** y consultar la URL del modelo.
2. Revisar título, autor, licencia, portada, descripción, perfil, tamaño estimado, placas e impresora declarada.
3. Abrir **Conector MakerWorld · mi cuenta** y conectar por contraseña, completar los códigos solicitados o introducir un token existente. También se puede pegar el JSON de descarga en el campo alternativo.
4. Elegir el perfil y pulsar **Preparar descarga**. Se muestra nombre de archivo y servidor de descarga.
5. Pulsar **Confirmar importación**. La cola descarga una copia local, registra el origen y programa el análisis existente. El diálogo muestra estado y enlace al modelo.

La cuenta se puede probar y desconectar. Desconectar elimina el token almacenado por MiniFactory; no revoca por sí mismo la sesión remota de Bambu ni cancela una descarga ya confirmada mediante enlace temporal.

## Datos y controles

- `library_accounts`: sesión por taller, usuario y proveedor. Token cifrado con AES-256-GCM y la clave propia del despliegue. Migración `0027_library_accounts`.
- Los tokens nunca forman parte de los props del cliente, resultados de importación, trabajos de cola ni copias exportables. La API recibe el token solo en su origen fijo; la descarga del CDN no lleva autorización de cuenta.
- El desafío 2FA viaja cifrado. Las contraseñas y códigos se usan para la solicitud de acceso y se limpian del formulario.
- Los enlaces temporales se guardan cifrados en `secretUrl`; la interfaz recibe solo origen público, nombre y host de descarga. No se guardan en localStorage.
- Preparar no descarga el archivo ni crea un modelo. Confirmar realiza en una transacción la transición a cola y la creación del trabajo. El identificador de operación mantiene la idempotencia.
- Confirmación y seguimiento requieren permiso de creación de archivos y pertenencia al usuario y taller. La cuenta de un usuario no se usa para otro.
- HTTPS, validación DNS contra destinos privados, fijación de dirección en el socket, límites de redirecciones, tiempo y 500 MiB. Se rechazan páginas HTML, JSON y respuestas sin firma ZIP cuando se espera 3MF; el análisis posterior verifica la estructura del modelo.
- Una licencia desconocida no se convierte en autorización comercial. La licencia original se conserva junto al origen.
- `instance.id=3766961` identifica el perfil descargable del ejemplo. El campo interno `profileId=1004749352` tiene otro significado y no se usa en la ruta de descarga.

## Pruebas y alcance de la evidencia

Pruebas automatizadas: `tests/unit/makerworld.test.ts`, `tests/unit/source.test.ts`, `tests/unit/library-http.test.ts`, `tests/integration/makerworld-import.test.ts`: **18 pruebas aprobadas**, con PostgreSQL embebido en memoria para la integración.

La integración cubre almacenamiento cifrado, aislamiento, expiración, desconexión, origen fijo de autenticación, resolución con Bearer, preparación sin descarga, confirmación única, descarga sin credenciales de cuenta, conservación de autor/licencia/origen y rechazo de HTML. Las respuestas autenticadas y el archivo 3MF de esta prueba son fixtures; no demuestran una descarga autenticada real del modelo del usuario.

`scripts/makerworld-import-smoke.mjs` comprueba en el navegador del entorno aislado la URL real, metadatos públicos, perfil seleccionado y mensaje de inicio de sesión requerido. No envía credenciales de Bambu ni importa un binario original. La captura se guarda en `data/library-test-evidence/makerworld-dialog.png`.

Ejecución real aprobada: «Pumpkin Patch Pal», «Zesty 3D by Art», «Standard Digital File License», perfil `3766961`, **15,61 MiB**, **11 placas**, X1 Carbon. Comprobación TypeScript y construcción Next aprobadas; contenedores de app y worker de pruebas actualizados el 18 de octubre alrededor de las 03:58 UTC. Los inicios de producción permanecen en `2026-10-17T17:08:34.635386732Z` (app) y `2026-10-16T23:48:31.790702187Z` (base).

## Límites pendientes de validación con una cuenta real

- Login con contraseña, correo, 2FA y descarga autenticada necesitan una cuenta aportada por el usuario en la interfaz. No se usaron credenciales productivas ni sesiones del navegador del usuario.
- MakerWorld/Bambu puede cambiar estas rutas, exigir CAPTCHA o restringir el modelo. Un token válido para la cuenta no garantiza permiso de descarga de todos los modelos.
- Los enlaces firmados pueden caducar o depender del contexto de la sesión. No se promete renovación automática: ante rechazo se prepara una importación nueva. No se almacenan refresh tokens ni contraseñas para renovar silenciosamente.
- Tamaño, placas y compatibilidad de la revisión son datos declarados por el proveedor; el tamaño real queda acotado durante la descarga. La URL directa al endpoint de perfil no aporta por sí sola toda la ficha del modelo: es preferible consultar su URL pública.
- El límite de intentos de autenticación reutiliza el contador por proceso de la aplicación. Un despliegue con varias réplicas requerirá un contador compartido.
- Las rutas de otras galerías conservan la alternativa de registrar origen y adjuntar el archivo manualmente. No se promete autenticación universal para otros proveedores.

## Despliegue

`bash scripts/library-test.sh up` construye la imagen `minifactory-library-test:feature` y actualiza únicamente el proyecto de pruebas. La base y los volúmenes productivos no intervienen. La migración se ejecuta al abrir la base aislada; no requiere modificar ni reiniciar producción.
