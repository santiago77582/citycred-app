# WhatsApp CityCred API

Backend propio de CityCred conectado a la **WhatsApp Cloud API oficial de Meta**. No usa WhatsApp Web, códigos QR, Selenium ni librerías no oficiales.

## Estado real

El repositorio contiene el backend, el panel de conversaciones, CRM, plantillas, borradores de campañas, estadísticas y monitoreo interno. Cada cambio se valida con pruebas, TypeScript, compilación y auditoría de dependencias.

Esto no significa que el backend nuevo esté atendiendo actualmente el número real. El webhook de Meta y el sistema anterior permanecen sin cambios hasta realizar una migración controlada y autorizada.

Las campañas solo admiten **borradores y vista previa**. No existe una ruta que ejecute envíos masivos.

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
- Preparar campañas sin ejecutarlas y excluir contactos no habilitados.
- Consultar estadísticas operativas de solo lectura.
- Ejecutar verificaciones internas de mensajes, webhooks, campañas y respaldos.
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

Solo permite crear y editar borradores y generar vistas previas. `GET /api/v1/campaigns/capabilities` informa `executionEnabled: false`.

### Estadísticas y monitoreo

- `GET /api/v1/analytics/dashboard?days=30`
- `GET /api/v1/operations/overview`
- `POST /api/v1/operations/check`
- `/api/v1/operations/alerts/**`

El monitor consulta únicamente la base local. No llama a Meta ni envía mensajes.

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
