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

## Revisión del conector y de la experiencia de importación

El usuario informó que introducir correo y contraseña no producía una reacción visible. La revisión encontró dos problemas concretos: el aviso se mostraba al final de una ficha larga, lejos del formulario, y el transporte HTTP descartaba el cuerpo de las respuestas de error antes de que el conector pudiera interpretar el siguiente paso. No se dispone de las credenciales ni de la respuesta del intento original del usuario, por lo que no se atribuye su fallo a una contraseña incorrecta o a un CAPTCHA específico.

### Cambios del backend

- Transporte propio para las respuestas de Bambu con lectura acotada y espera de 15 segundos por petición. Clasifica errores de credenciales, códigos, sesión caducada, bloqueo web, permisos, disponibilidad y límite de intentos; no devuelve el texto crudo del proveedor ni datos de cuenta.
- Conserva los pasos `verifyCode` y `tfa` cuando llegan dentro de HTTP 400. Los errores de aplicación recibidos con HTTP 200 también se interpretan.
- La conexión se comprueba con el proveedor antes de mostrarse como verificada. Tener un token guardado ya no basta para mostrar una cuenta conectada.
- Reenvío de código con espera de un minuto y límite de intentos. Se recorta el espacio exterior del correo y se aceptan los prefijos habituales al pegar un token.
- El segundo factor conserva la cookie de sesión de una respuesta de redirección, sin seguir esa redirección y perder el token.
- Las acciones devuelven códigos de error seguros para orientar la recuperación en la interfaz.

### Cambios del frontend

- Proceso guiado: enlace, revisión del modelo y acceso/importación. Una acción principal por pantalla; se muestran las alternativas cuando son necesarias.
- Ficha visual con portada, perfil, tamaño, placas e impresora. Descripción plegable y licencia resumida; no se mezcla la ficha con el formulario de cuenta.
- Pantalla de acceso dedicada con estado «Conectando con Bambu…», contraseña visible opcionalmente y verificación por código cuando corresponde. El error aparece junto al formulario y recibe foco para evitar que quede fuera de vista.
- Tras conectar se prepara la descarga automáticamente y se muestra una confirmación. No hay que adivinar qué botón pulsar después de iniciar sesión.
- El acceso mediante navegador tiene instrucciones y enlaces al sitio y al endpoint del perfil. El token queda como opción avanzada; no es el primer campo mostrado.
- Seguimiento con estados comprensibles, recuperación de errores, prevención de envíos dobles y fin del sondeo en estados terminales. Cerrar la ventana descarta respuestas antiguas del formulario y limpia los secretos locales.
- Diseño adaptable a móvil con los componentes, paleta e iconos existentes; no se agregan dependencias de interfaz.

### Validación de esta revisión

**30 pruebas aprobadas** en cinco archivos: transporte, parser/metadatos, límites HTTP e integración. La integración verifica también las acciones reales de inicio de sesión, la respuesta de código de correo, la sesión verificada y su expiración, el aislamiento del desafío 2FA y la normalización de tokens, con el proveedor simulado. Se comprueba la conservación del token devuelto en una redirección del segundo factor.

Se hizo además una solicitud real de login con campos vacíos, sin una cuenta ni contraseña de usuario: Bambu respondió HTTP 400 y el conector devolvió el error de credenciales interpretado. Esto acredita la ruta de error, no un inicio de sesión real satisfactorio.

El script de navegador se amplió y pasó para revisar escritorio y móvil, simular una caída de la acción al enviar el formulario (sin enviar credenciales al proveedor), comprobar el indicador de espera, el error visible y enfocado, el botón de reintento y la alternativa por navegador. Capturas: `data/library-test-evidence/makerworld-dialog.png`, `makerworld-mobile.png` y `makerworld-login-error.png`. La autenticación y descarga real con la cuenta del usuario siguen pendientes de su acceso desde la interfaz.

## Imágenes del sitio guardadas en la biblioteca (2026-10-18)

- La inspección conserva la galería de MakerWorld y muestra su cantidad antes de importar. Al descargar el modelo, se crea un trabajo persistente `source.images`; también se ejecuta al asociar o actualizar un origen desde la ficha (incluidos otros sitios con OpenGraph/JSON-LD).
- Las imágenes se descargan sin reenviar credenciales del conector. Quedan guardadas localmente como WebP: lado mayor de 1600 px, calidad 78, miniaturas de 320 y 800 px, sin EXIF/GPS. No se guarda el original pesado; GIF se convierte en imagen estática.
- Se vinculan como imágenes del autor, con URL de origen, autor y licencia. La primera imagen disponible pasa a ser portada si no había una seleccionada. La biblioteca, la galería y el panel de origen utilizan las copias locales. El usuario puede cambiar la portada mediante las herramientas de fotos existentes.
- Máximo 12 imágenes por origen, 8 MiB descargados por imagen y 24 millones de píxeles de entrada. HTTPS público, control de redirecciones y destinos privados, plazo de 15 segundos por petición. Se aceptan JPEG, PNG, WebP, AVIF y GIF.
- La deduplicación por contenido comprimido y modelo evita repetir fotos al reintentar. Cada imagen correcta se conserva aunque falle otra; los trabajos fallidos se reintentan mediante la cola y pueden revisarse en la administración de trabajos. Una imagen inaccesible no revierte la importación del archivo 3D.
- Las imágenes que requieren una sesión, enlaces caducados o galerías que solo aparecen mediante JavaScript pueden no estar disponibles. Se puede actualizar el origen para recuperar enlaces y volver a intentarlo, o adjuntar fotos manualmente. Esta captura no requiere IA ni cambia los derechos de uso del autor.
- Para modelos importados anteriormente, actualizar el origen en su ficha inicia la recuperación de las imágenes. No hay descarga masiva retroactiva automática.

Validación específica: 21 pruebas aprobadas en `tests/integration/source-images.test.ts`, `tests/integration/makerworld-import.test.ts` y `tests/unit/source.test.ts`. Incluyen compresión y metadatos, deduplicación, cola desde el importador, fallos parciales, límites de descarga, contenido inválido y conservación de portada manual. `scripts/source-images-smoke.ts` comprueba la galería pública de Pumpkin Patch Pal exclusivamente en la base `library_test`; crea una ficha claramente identificada sin archivo 3D y no simula haber descargado el 3MF autenticado.

Resultado real en pruebas: 7 imágenes recuperadas, 880.980 bytes totales entre las 21 variantes WebP (unos 860 KiB). Ficha de evidencia: `/archivos/7f899f5c-589f-4927-ad00-955589e5a158`. La comprobación de navegador confirmó las imágenes locales accesibles, la portada en la biblioteca y el panel de origen; capturas en `data/library-test-evidence/source-images-{model,library}.png`. También pasó nuevamente la comprobación del diálogo en escritorio/móvil. Docker compilado y desplegado solo en `minifactory-library-test`, puerto 3011, con salud correcta; los contenedores productivos conservaron sus fechas de arranque.
