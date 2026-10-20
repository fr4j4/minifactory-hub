# Conector MakerWorld e importación con revisión previa

Fecha: 2026-10-18. Rama: `feature/biblioteca-3d-multifuente`.
Destino exclusivo: `minifactory-library-test`, puerto 3011, base `library_test`.

## Configuración unificada y verificación de correo

`Configuración → Integraciones` concentra MakerWorld y Bambu Lab. El importador y el alta global de impresoras reutilizan el mismo formulario de asociación. La sesión personal puede reutilizar una cuenta de impresoras creada por ese usuario, o compartirse explícitamente con el conector del taller tras validarla. No se incorporan impresoras automáticamente; la configuración LAN y las cuentas de China conservan su flujo existente. Desconectar MakerWorld no corta las sesiones de las impresoras.

Se eliminaron las solicitudes automáticas adicionales de correo al recibir `verifyCode`: la interfaz pide el código y ofrece reenviarlo bajo demanda, sin afirmar que se envió un correo que no se confirmó. Un código rechazado no reinicia el acceso ni genera otro envío. Se corrigió la detección demasiado amplia de CAPTCHA sobre el JSON completo: un campo `captchaId` vacío en un error de código ya no se interpreta como bloqueo web. Los desafíos HTTP 418 reales reciben una recuperación explícita y una pausa de cinco minutos para las solicitudes de acceso de ese usuario en el proceso actual. Las contraseñas se descartan y solo se guardan tokens cifrados y verificados.

Un CAPTCHA auténtico no se resuelve automáticamente desde el servidor. La opción «Sesión del navegador» explica cómo completar el acceso oficial y asociar el token. No se presenta abrir una pestaña como una conexión automática, ni pegar el JSON de un archivo como asociar una cuenta. La descarga manual sigue siendo una alternativa independiente en el importador. La verificación con app autenticadora permite solicitar un código por correo cuando la verificación web no está disponible.

Se contrastó el flujo de códigos y desafíos con el [código del conector ha-bambulab](https://github.com/greghesp/ha-bambulab/blob/main/custom_components/bambu_lab/pybambu/bambu_cloud.py) y la [implementación de Bambu Cloud de Bambuddy](https://github.com/maziggy/bambuddy/blob/main/backend/app/services/bambu_cloud.py). Son implementaciones de terceros, no contratos oficiales. El mensaje comunicado por el usuario no incluye la respuesta HTTP del proveedor; estas correcciones no permiten afirmar cuál de esos casos ocurrió en su cuenta.

Las pruebas del acceso con contraseña y correo usan respuestas simuladas: no se dispone de contraseña ni código de correo para certificar ese inicio de sesión real. Pasaron 34 pruebas en cuatro archivos (transporte, conector, importación e integraciones). El script `scripts/integrations-browser-smoke.mjs` verifica el modal, el paso de correo, errores enfocados, recuperación ante CAPTCHA y vista móvil sin enviar credenciales al proveedor.

Comprobación real adicional: la sesión ya guardada en pruebas se verificó correctamente contra Bambu. La descarga autenticada del perfil 3766961 devolvió un desafío web desde la API; la ruta alternativa en `makerworld.com/api/v1/design-service/instance/3766961/f3mf`, usando esa sesión mediante cookie, respondió HTTP 403 con HTML de Cloudflare. Por tanto, no se certifica una descarga automática real ni la eliminación del bloqueo externo. El importador conserva una alternativa manual independiente, sin desconectar la sesión válida. Solo se desplegó el proyecto Docker de pruebas (puerto 3011); producción y su base no se modificaron.

## Hallazgo y decisión inicial

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

## Propuesta: verificación humana durante la importación (2026-10-18)

Esta sección conserva el diseño inicial. La implementación se describe a continuación; la descarga original de Gnome Mushroom sigue necesitando validación con el proveedor y, cuando la solicite, intervención humana.

La prueba del perfil `3769534` del modelo `3319718` obtuvo HTTP 418 con `captchaId`, `apiServers` y `staticServers`. El navegador de diagnóstico recibió HTTP 403 y la página «Just a moment…». Son dos capas distintas: el desafío de descarga de Bambu y el desafío de acceso web de Cloudflare. Una cuenta válida no acredita que ambas se hayan superado.

### Recorrido propuesto

1. Conservar la operación, el modelo, el perfil y la ficha al detectar el desafío. Mostrar «MakerWorld necesita una verificación» con la acción principal «Resolver en el navegador»; no volver a pedir correo ni códigos por un bloqueo de descarga.
2. Abrir un navegador gráfico aislado, con sesión individual y acceso remoto autenticado desde el importador. Mostrar la página original completa y su dirección. El usuario interactúa directamente con la verificación oficial y, si corresponde, inicia sesión en el proveedor.
3. Completar la descarga en ese mismo navegador y contexto de red. Recoger el archivo terminado desde su carpeta privada; no trasladar simplemente cookies a las peticiones HTTP actuales ni asumir que el desafío queda resuelto al cerrar la ventana.
4. Validar el archivo, confirmar modelo/perfil con el usuario cuando no pueda acreditarse automáticamente la correspondencia e iniciar la ingestión idempotente. Conservar atribución, licencia y la cola de imágenes comprimidas.
5. Mostrar el resultado real. Si el proveedor sigue bloqueando el navegador, ofrecer descargar en el navegador habitual y adjuntar el 3MF dentro de la operación existente.

### Arquitectura y límites

- Servicio independiente de navegador gráfico (Chromium, pantalla virtual y transporte remoto, por ejemplo noVNC), disponible inicialmente solo en pruebas. El contenedor actual no incluye este servicio. Un iframe de la página de MakerWorld o una imagen del CAPTCHA no sustituyen este contexto.
- Cada sesión pertenece a un usuario y una operación, tiene vencimiento y carpeta de descarga exclusiva. El acceso pasa por autenticación de MiniFactory; los puertos de escritorio/control no se publican directamente. Separar red, sistema de archivos y secretos de aplicación, base de datos y producción.
- El navegador tiene acceso a Internet, pero no a servicios internos ni metadatos de infraestructura. Desactivar portapapeles compartido, registro de teclas y grabaciones de autenticación. Eliminar sesión y archivos temporales al terminar o vencer; conservar una sesión entre importaciones solo mediante una opción explícita y almacenamiento protegido.
- Usar un navegador normal con interacción humana. No automatizar la resolución, suplantar clientes oficiales ni modificar las señales para esconder automatización. Cloudflare declara los navegadores automatizados fuera de soporte; un prototipo remoto necesita comprobarse con una persona antes de presentarlo como solución fiable.
- Si el navegador remoto también resulta bloqueado, evaluar un acompañante local o extensión con permisos limitados: abre MakerWorld en el equipo del usuario y transfiere el archivo ya descargado a una operación autorizada. No exportar contraseñas/cookies. Requiere instalación y un canal autenticado; no se obtiene comunicación entre sitios arbitrarios solo abriendo una pestaña.
- No se ha confirmado un contrato público de MakerWorld para incrustar su widget y enviar la respuesta. `captchaId` por sí solo no documenta el protocolo; no inventar endpoints ni claves del proveedor.

### Criterios de aceptación

- Una persona ve y puede resolver el desafío real; la misma sesión descarga el 3MF original solicitado. Guardar evidencia de estado, tamaño y hash, sin secretos ni capturas de autenticación.
- Cancelación, caducidad, reinicio, descarga incompleta, archivo inválido y reintento no crean modelos duplicados ni pierden la ficha.
- Una segunda cuenta no puede acceder a la sesión, imágenes de escritorio ni archivos de la primera. La sesión vencida queda inaccesible.
- Las pruebas simuladas de estados y las pruebas reales con intervención humana se informan por separado. Hasta superar la descarga real, el flujo sigue siendo experimental.

Referencias: [comportamiento de los desafíos de Cloudflare](https://developers.cloudflare.com/cloudflare-challenges/challenge-types/challenge-pages/), [navegadores admitidos](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/) y [reporte de HTTP 418 y GeeTest en Bambu Studio](https://github.com/bambulab/BambuStudio/issues/12158). El reporte de terceros coincide con el tipo de fallo observado, pero no demuestra la causa específica de esta cuenta.

## Implementación del navegador interactivo

- Ante `browser_required`, preparar la importación guarda una operación `awaiting_file` con su ficha, perfil y galería. La interfaz abre una pantalla de verificación sin marcar la cuenta como inválida. También puede iniciarse desde la pantalla de acceso cuando el login por API está bloqueado.
- `services/makerworld-browser/server.mjs` ejecuta Chromium gráfico en el servidor, bajo Xvfb. El diálogo transmite capturas JPEG temporales de calidad 65, aproximadamente cada 800 ms, y envía ratón, arrastre, rueda, teclado y pegado explícito. En móvil ofrece desplazamiento horizontal y un campo de escritura. No se guarda una grabación del acceso.
- Se reutiliza, cuando existe, el token personal de MakerWorld como cookie del navegador temporal. El token viaja únicamente entre app y servicio privado. No se devuelve al cliente, ni se reutilizan cuentas ajenas o credenciales de impresoras. Si el proveedor no admite esa sesión, el usuario puede iniciar sesión en la página oficial.
- El servicio solicita el perfil elegido dentro del contexto del navegador. Si necesita el recorrido web, abre el menú oficial «Download 3MF». La interacción con CAPTCHA corresponde al usuario; no se generan respuestas ni se utilizan servicios de resolución. Los intentos automáticos están acotados y hay reintento explícito.
- Se observa exclusivamente la respuesta de descarga del perfil seleccionado. Al obtener el enlace HTTPS, Chromium descarga el 3MF en el servidor utilizando su propia sesión y red. No se intenta trasladar la autorización a un cliente HTTP ajeno al navegador.
- El trabajo persistente `browser.import` recoge el archivo terminado e inicia la ingestión; funciona aunque el usuario cierre el diálogo. Conserva autor, licencia y la cola de imágenes WebP. El sondeo del trabajo tiene espera creciente de hasta un minuto, por lo que la finalización puede tardar ese intervalo en aparecer.
- La ingestión admite hasta 500 MiB, comprueba firma ZIP y estructura 3MF, limita número de entradas y tamaño declarado sin descomprimir, y evita versiones duplicadas mediante una transición atómica. Los fallos recuperables permiten reintentar. Los trabajos pueden recuperar una ingestión interrumpida tras cinco minutos.
- «Actividad reciente → Continuar verificación» recupera la operación. Si el proveedor continúa bloqueando el navegador del servidor, una alternativa plegada permite adjuntar el 3MF local en el mismo diálogo y conserva la ficha; es secundaria a la descarga automática.

### Despliegue y aislamiento

Exclusivo del proyecto Docker `minifactory-library-test`, puerto 3011. Se añaden `makerworld-browser` y `browser-proxy`; no tienen puertos publicados. El navegador solo pertenece a redes Docker internas. El proxy admite túneles HTTPS hacia direcciones públicas, resuelve DNS y fija la dirección antes de conectar; rechaza loopback, LAN, metadatos y rangos especiales. El navegador no comparte red con PostgreSQL ni tiene volúmenes de la app.

El servicio requiere una clave independiente `LIBRARY_TEST_BROWSER_KEY`, generada en el archivo de entorno ignorado por Git. Chromium recibe un entorno mínimo sin esa clave. Cada operación tiene perfil y carpeta temporales propios; las rutas públicas comprueban sesión, permiso, taller, propietario y origen de las mutaciones. Solo se admiten acciones de control predefinidas, sin una interfaz pública para ejecutar JavaScript arbitrario. Máximo dos sesiones, vencimiento absoluto de 20 minutos, memoria de 2 GiB y disco temporal de 2 GiB. Al finalizar o vencer, se elimina la sesión. Un reinicio del servicio elimina sus sesiones; se puede reabrir la operación conservada en la base.

Los perfiles comparten el contenedor de navegador y Chromium se ejecuta sin su sandbox interno por compatibilidad con este Docker restringido. El aislamiento se apoya en el contenedor, redes, permisos y autenticación de control; no equivale a una máquina virtual por usuario. Para desplegar este servicio en un entorno multiusuario no confiable, separar cada navegador en su propio contenedor y revisar el sandbox del navegador. No se ha habilitado en producción.

### Pruebas reproducibles

- `tests/integration/makerworld-import.test.ts`: CAPTCHA, ficha conservada, propietario/taller, protección de origen, cola automática, estructura del archivo, reintentos concurrentes, ingestión idempotente e imágenes. El proveedor está simulado.
- `tests/unit/browser-egress.test.ts`: rangos de red privados, especiales, IPv4 e IPv6.
- `scripts/makerworld-browser-download-smoke.mjs`: Chromium real y worker real en pruebas; intercepta exclusivamente una página sintética para simular las respuestas del proveedor. Descargó un 3MF de 589 bytes y el worker lo incorporó automáticamente con el importador cerrado. Evidencia inicial: modelo `cbc97890-e75a-4405-94cd-f396c039e31c`, claramente titulado como prueba sintética. Esto no acredita una descarga del modelo Gnome Mushroom.
- `scripts/makerworld-browser-smoke.mjs`: ficha pública real de Gnome Mushroom, apertura del servicio, pantalla de escritorio/móvil y rechazo de un origen ajeno. No resuelve CAPTCHA ni prueba que el proveedor haya autorizado el archivo original.
- Comprobación real de red: CONNECT a `127.0.0.1`, `169.254.169.254` y `192.168.1.14` devuelve 403; CONNECT a `example.com` devuelve 200. La salida directa a Internet desde el navegador está bloqueada y el control sin autenticación devuelve 401.

Resultado del despliegue del 18 de octubre: **44 pruebas aprobadas en seis archivos**, comprobación TypeScript y compilación Next aprobadas. La prueba de navegador de escritorio/móvil, la reanudación por URL y la regresión del importador de Pumpkin Patch Pal pasaron. Se verificaron ratón, escritura y Backspace contra una página sintética, seguidos de descarga real por Chromium e ingestión automática por el worker con el importador cerrado: modelo de evidencia `80f12a0a-514f-4030-a5d7-a483f5f02c43`.

La página real de Gnome Mushroom abrió correctamente, reconoció la cuenta guardada y mostró el CAPTCHA oficial después de seleccionar automáticamente «Download 3MF» para el perfil AMS. Se dejó la operación `ad4c8f0a-9299-4ed6-84ba-a003e5ce0bdb` disponible para intervención humana. Los reintentos se pausan cuando el widget de verificación está visible para no invalidar el desafío del usuario. La aceptación del CAPTCHA y la descarga real del original solo pueden darse por verificadas después de que MakerWorld entregue el archivo. No se equipara una prueba simulada ni una cuenta válida con ese resultado.

Producción conservó sus arranques: app `2026-10-17T17:08:34.635386732Z`, worker `2026-10-17T17:08:34.619597903Z` y base `2026-10-16T23:48:31.790702187Z`. No se cambió su composición, imagen en ejecución ni base de datos.

## Corrección de descarga detenida después del CAPTCHA (2026-10-18)

Se observó la sesión real de la operación `922562b8-c0a3-4342-ac53-d8835c4ebd84`: después de la verificación humana, el endpoint del perfil AMS `3769534` devolvió HTTP 200 con nombre y URL autorizada. Chromium notificó `suggestedFilename: "download"`. El servicio anterior exigía que ese nombre terminara en `.3mf`, cancelaba el archivo y mantenía el mensaje de descarga indefinidamente.

- Se acepta únicamente la URL autorizada del perfil seleccionado y sus redirecciones HTTPS observadas. El nombre se toma de los metadatos del proveedor; hay un nombre `.3mf` de respaldo cuando Chromium entrega uno genérico. La ingestión sigue comprobando la estructura real del archivo, además del límite de tamaño.
- `requesting_download` distingue autorización de transferencia efectiva. `downloading` comienza con el evento real de Chromium; la interfaz muestra bytes recibidos y total cuando se conoce. Si no empieza en 20 segundos o no recibe datos durante 90 segundos, muestra un error y permite reintentar. También se informa cancelación o exceso de tamaño.
- La interfaz vuelve a consultar el estado si la petición de captura falla justo cuando el worker termina la importación, evitando mostrar un error después del éxito.
- Se recuperó el enlace autorizado desde la sesión ya verificada, sin guardarlo en archivos ni registros, y se descargó el original mediante HTTP desde el backend. `completeBrowserImport` validó e incorporó **13.624.215 bytes**, con estado de procesamiento `ready`. Esta recuperación puntual se distingue de la prueba del flujo automático corregido con proveedor simulado.
- El modelo real conserva siete imágenes, con **2.244.172 bytes en las 21 variantes WebP**, sin EXIF y con lado mayor máximo de 1600 px. Se verificaron su acceso local, galería, portada y panel de origen en el navegador. Se corrigieron permisos de una carpeta del volumen de pruebas que habían dejado diagnósticos anteriores ejecutados como root; las comprobaciones de almacenamiento deben ejecutarse con `docker exec -u app`.

Evidencia real: `/archivos/922562b8-c0a3-4342-ac53-d8835c4ebd84` en el puerto 3011. Regresión: `tests/unit/browser-download-state.test.ts` cubre nombre genérico, URL autorizada, bytes, cancelación, tamaño y plazos; el conjunto del conector suma 49 pruebas aprobadas. `scripts/makerworld-browser-download-smoke.mjs` reproduce un recurso `.bin` con nombre de descarga `download` y nombre Unicode `.3mf` en los metadatos. `scripts/makerworld-progress-smoke.mjs <operación>` comprueba estados simulados de la interfaz, progreso, reintento, móvil y finalización durante una petición de captura.

Resultado sobre Docker actualizado: compilación Next y tipos aprobados, salud `library-test` correcta. La descarga sintética de 589 bytes mediante Chromium real y el worker terminó automáticamente con el importador cerrado: modelo `577fefbf-c9fb-4b51-989d-c3e774232e04`. La comprobación de interfaz también pasó en sus cinco escenarios. La descarga original se acreditó mediante la recuperación descrita arriba; esta regresión automatizada utiliza un proveedor simulado. Producción conservó las mismas fechas de arranque de app, worker y PostgreSQL indicadas en la sección anterior.

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
