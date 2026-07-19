# WhatsApp CityCred API

Backend propio de CityCred conectado a la **WhatsApp Cloud API oficial de Meta**. No usa WhatsApp Web, códigos QR, Selenium ni librerías no oficiales.

## Estado real

El repositorio contiene el backend, el panel de conversaciones, CRM, plantillas, borradores de campañas, estadísticas y monitoreo interno. Cada cambio se valida con pruebas, TypeScript, compilación y auditoría de dependencias.

Esto no significa que el backend nuevo esté atendiendo actualmente el número real. El webhook de Meta y el sistema anterior permanecen sin cambios hasta realizar una migración controlada y autorizada.

Las campañas incluyen borrador, vista previa, simulación, doble control y una cola de ejecución. La cola permanece **apagada por defecto** y no arranca sin `CAMPAIGN_EXECUTION_ENABLED=true`.

El panel admite usuarios individuales con correo, contraseña, roles, sesiones firmadas y revocación inmediata. La clave administrativa compartida queda únicamente como acceso de emergencia.

## Funciones incluidas

- Recibir mensajes y estados por webhook firmado de Meta.
- Enviar texto sin reintentos ambiguos que puedan duplicar mensajes.
- Sincronizar plantillas desde la WABA y enviar únicamente plantillas aprobadas.
- Enviar imágenes, audio, video y documentos con validación de formato y tamaño.
- Guardar contactos, conversaciones, mensajes, archivos, plantillas y eventos en PostgreSQL.
- Evitar duplicados mediante el identificador de WhatsApp.
- Mantener estados salientes monotónicos; `FAILED` es terminal.
- Pausar el bot al responder manualmente.
- Administrar ficha comercial, consentimiento, etiquetas y respuestas rápidas.
- Preparar, simular y aprobar campañas con exclusión y revalidación de contactos no habilitados.
- Importar clientes desde CSV o XLSX mediante vista previa y confirmación separadas.
- Consultar estadísticas operativas de solo lectura.
- Ejecutar verificaciones internas de mensajes, webhooks, campañas y respaldos.
- Programar verificaciones internas con alertas deduplicadas y autorresolución.
- Generar respaldos PostgreSQL con checksum y validación estructural del archivo.
- Probar una restauración real únicamente contra una base descartable separada.
- Administrar catálogo, perfil comercial, WhatsApp Flows y analíticas oficiales desde el panel.
- Ejecutar el bot comercial y sus seguimientos mediante colas persistentes, apagados por defecto.
- Recibir el intercambio cifrado de WhatsApp Flows, apagado por defecto.
- Ocultar credenciales en eventos, mensajes y registros HTTP.

## Requisitos locales

- Node.js 24 o superior.
- npm.
- PostgreSQL.
- Docker opcional.

```bash
cp .env.example .env
npm ci
docker compose up -d
npm run db:init
npm run dev
```

La API queda disponible en `http://localhost:3000`.

## Variables obligatorias

```env
API_KEY=clave-privada-de-32-caracteres-o-mas
DATABASE_URL=postgresql://usuario:clave@servidor:5432/base
DATABASE_SSL=false
```

Para separar el acceso visual de la clave técnica:

```env
ADMIN_PASSWORD=otra-clave-administrativa-larga
```

Mientras `ADMIN_PASSWORD` esté vacío, el panel utiliza `API_KEY` como compatibilidad temporal.

## Variables de Meta

```env
META_GRAPH_VERSION=
META_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
```

Pueden dejarse vacías para publicar y comprobar `/health`. Los envíos y la sincronización devolverán `503` hasta completar la conexión.

El endpoint cifrado de WhatsApp Flows se configura por separado y permanece apagado salvo que todas las variables estén presentes:

```env
FLOW_ENDPOINT_ENABLED=false
FLOW_ENDPOINT_MATERIAL=
FLOW_ENDPOINT_PASSPHRASE=
FLOW_STORAGE_MATERIAL=
FLOW_INITIAL_SCREEN=INICIO
```

`FLOW_ENDPOINT_MATERIAL` es la clave privada PEM y `FLOW_STORAGE_MATERIAL` debe contener 32 bytes aleatorios codificados en base64. Ambos son secretos del hosting y no deben guardarse en GitHub.

La ejecución de campañas se configura por separado. Debe permanecer apagada hasta validar staging y autorizar una prueba controlada:

```env
CAMPAIGN_EXECUTION_ENABLED=false
CAMPAIGN_MAX_RECIPIENTS=250
CAMPAIGN_PREVIEW_TTL_MINUTES=60
CAMPAIGN_TIME_ZONE=America/Argentina/Buenos_Aires
CAMPAIGN_SEND_WINDOW_START_HOUR=9
CAMPAIGN_SEND_WINDOW_END_HOUR=18
```

El monitoreo programado y los respaldos también tienen activación separada y permanecen apagados por defecto:

```env
OPERATIONS_SCHEDULER_ENABLED=false
OPERATIONS_CHECK_INTERVAL_MINUTES=15
BACKUP_SCHEDULER_ENABLED=false
BACKUP_INTERVAL_HOURS=24
BACKUP_INITIAL_DELAY_MINUTES=5
BACKUP_RETENTION_COUNT=14
BACKUP_COMMAND_TIMEOUT_MINUTES=30
BACKUP_DIRECTORY=/app/data/backups
BACKUP_RESTORE_TEST_ENABLED=false
BACKUP_RESTORE_TEST_DATABASE_URL=
```

`BACKUP_DIRECTORY` debe ser un volumen persistente y protegido; el disco efímero del contenedor no constituye una copia durable. La base de restauración debe ser distinta de la base principal y su nombre debe terminar exactamente en `_restore_test`. Para conexiones SSL, agregar `?sslmode=require` a esa URL.

## Accesos principales

- `GET /health`: estado público, sin mostrar secretos.
- `GET|POST /webhooks/whatsapp`: verificación y eventos firmados de Meta.
- `GET|POST /flows/data-exchange`: estado e intercambio cifrado de WhatsApp Flows.
- `GET /admin`: panel visual protegido por sesión.
- `GET /admin/crm`: CRM, plantillas, campañas y estadísticas.
- `/api/v1/**`: API técnica protegida mediante `x-api-key`.

### Mensajes

- `POST /api/v1/messages/text`
- `POST /api/v1/messages/template`
- `POST /api/v1/messages/mark-read`

La ruta de plantillas valida el nombre y el idioma contra la lista sincronizada. Una plantilla ausente, pendiente, rechazada o desactualizada no llega a Meta.

### Conversaciones y CRM

- `GET /api/v1/conversations`
- `GET /api/v1/conversations/{waId}/messages`
- `/api/v1/crm/**`

### Multimedia y plantillas

- `/api/v1/media/**`
- `/api/v1/templates/**`

### Campañas

- `/api/v1/campaigns/**`

La API técnica permite preparar borradores y vistas previas. La simulación, aprobación y ejecución exigen una sesión individual del panel; la aprobación y el inicio deben pertenecer a administradores distintos. `GET /api/v1/campaigns/capabilities` informa el flag, límites, vigencia de la vista previa y horario.

Antes de cada destinatario, el worker vuelve a comprobar plantilla, consentimiento, baja, archivo y teléfono. Un resultado ambiguo queda `UNKNOWN` y no se reintenta automáticamente.

### Importación de clientes

- `POST /admin/api/imports/preview`
- `GET /admin/api/imports/{batchId}`
- `POST /admin/api/imports/{batchId}/commit`

Acepta CSV y XLSX de hasta 5 MB y 5.000 filas. La vista previa no modifica clientes. Un consentimiento vacío queda `UNKNOWN`; para importar `GRANTED` se exige fecha explícita, y una baja existente nunca se reactiva por archivo.

### Estadísticas y monitoreo

- `GET /api/v1/analytics/dashboard?days=30`
- `GET /api/v1/operations/overview`
- `POST /api/v1/operations/check`
- `/api/v1/operations/alerts/**`
- `GET /api/v1/operations/backups`

El monitor consulta únicamente la base local, guarda alertas deduplicadas y resuelve automáticamente las condiciones normalizadas. No llama a Meta ni envía mensajes o notificaciones externas.

Después de compilar, un operador puede ejecutar los procesos sin exponerlos por HTTP:

```bash
npm run build
npm run backup:run
npm run backup:restore-test -- UUID_DEL_RESPALDO
```

`backup:run` crea un dump custom de PostgreSQL, restringe sus permisos, valida el archivo con `pg_restore --list` y calcula SHA-256. Eso no se presenta como una restauración exitosa. `backup:restore-test` limpia y restaura la base descartable configurada, comprueba migraciones y tablas críticas, y recién entonces registra la verificación real.

## Comprobación completa

```bash
npm test
npm run typecheck
npm run build
npm audit --omit=dev
```

Las pruebas se ejecutan de forma serial porque cada archivo levanta una base PostgreSQL en memoria y reemplaza temporalmente la conexión global.

## Reglas operativas

- Fuera de la ventana de atención se usan plantillas aprobadas.
- No se envía una campaña sin consentimiento vigente.
- Un resultado ambiguo de Meta se guarda como `UNKNOWN` y no se reintenta automáticamente.
- Los secretos nunca deben copiarse al frontend, a capturas ni al repositorio.
- Cambiar el webhook, el número real o activar costos requiere una autorización y un plan de reversión.

## Archivos de apoyo

- `CONFIGURACION_META.md`: conexión con Meta.
- `PUBLICACION.md`: servidor y PostgreSQL.
- `openapi.yaml`: especificación resumida de la API técnica.
