# Plan de implementación y despliegue de pruebas

Rama: `feature/biblioteca-3d-multifuente`. Base: `3d70f49`. Spec: [biblioteca multifuente](spec-biblioteca-3d-multifuente.md).

## Estado de ejecución

Implementación ampliada: ver [matriz de cobertura y validación](validacion-spec-biblioteca-3d.md).

Primera entrega: núcleo implementado y desplegado en la instancia independiente del puerto 3011. Suite completa: 416 pruebas aprobadas. El [informe de entrega](entrega-biblioteca-3d-multifuente.md) detalla capacidades reales, aislamiento, acceso, validación y trabajo pendiente; la spec completa todavía incluye extensiones no implementadas.

## Aislamiento obligatorio

Proyecto Compose `minifactory-library-test`, puerto 3011, red bridge propia, PostgreSQL sin puerto publicado, volúmenes propios de datos y archivos. No usar el compose productivo, su `.env`, sus credenciales ni sus volúmenes. El entorno comienza vacío y recibe únicamente datos sintéticos. Cookies independientes para evitar interferencias al navegar por ambos puertos. IA e impresoras desactivadas inicialmente. Ninguna prueba puede usar `DATABASE_URL` del entorno del desarrollador.

## Secuencia de trabajo

1. Crear rama, plan y despliegue aislado reproducible.
2. Añadir migración compatible: conexiones, inventario remoto, escaneos persistentes, operaciones y colecciones. Mantener IDs y originales existentes.
3. Implementar adaptadores por capacidades: local/NAS, Google Drive, FTP/FTPS, SFTP, WebDAV, S3, OneDrive y Dropbox. Credenciales cifradas; capacidades no verificadas no se anuncian como disponibles.
4. Escaneo paginado/reanudable, detección de cambios, reconciliación solo tras recorrido completo y materialización verificada de versiones. Integrar el resolvedor en análisis, descargas, reparación y laminado.
5. Gestión de fuentes y actividad, explorador, operaciones confirmadas, colecciones, búsqueda paginada y filtros. Integrar fotos reales y vistas previas livianas.
6. Importación URL con protección de red y alternativa manual; IA opcional reutilizando propuestas y confirmación existentes.
7. Pruebas de aislamiento, conectores locales, idempotencia, conflictos, recuperación, migración, permisos y formato. Typecheck, build y pruebas de navegador sobre base exclusiva de pruebas.
8. Construir imagen de feature, levantar solo el proyecto de pruebas, comprobar salud, acceso y ausencia de montajes productivos. Entregar URL y guía de uso.

## Validación externa y alcance condicionado

Cada proveedor se prueba con fixtures y conector local cuando sea posible. La aceptación con Google Drive, OneDrive, Dropbox o un bucket real requiere una cuenta autorizada aportada al nuevo despliegue. MakerWorld mantiene URL + metadatos + subida manual mientras no exista un mecanismo de descarga autorizado verificado. No se simula éxito de integraciones sin credenciales.

La ampliación incluye un agente Python de solo lectura validado en Linux. Instaladores de escritorio para otros sistemas, conectores CAD propietarios y reconstrucción fotogramétrica continúan como extensiones condicionadas P4. La matriz de validación registra capacidades reales, límites y evidencia; la existencia de un adaptador no equivale a aceptación con cuentas reales.
