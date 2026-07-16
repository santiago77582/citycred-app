# WhatsApp CityCred API

Backend para conectar CityCred con la **WhatsApp Cloud API oficial de Meta**. No usa WhatsApp Web, códigos QR, Selenium ni librerías no oficiales.

## Estado actual

El código está terminado y validado localmente:

- compila con TypeScript;
- incluye pruebas automáticas para teléfonos argentinos;
- no presenta vulnerabilidades conocidas en `npm audit`;
- puede publicarse aunque todavía no se hayan cargado las credenciales de Meta;
- inicializa automáticamente las tablas de PostgreSQL al arrancar en producción.

La integración con el número real queda activa únicamente después de cargar las credenciales de la cuenta de Meta y configurar el webhook público.

## Funciones incluidas

- Enviar mensajes de texto dentro de la ventana de atención permitida por WhatsApp.
- Enviar plantillas aprobadas por Meta.
- Marcar mensajes como leídos.
- Recibir mensajes mediante webhook.
- Recibir estados `sent`, `delivered`, `read` y `failed`.
- Guardar contactos, conversaciones, mensajes y eventos en PostgreSQL.
- Normalizar números móviles argentinos al formato `549...`.
- Evitar mensajes entrantes duplicados mediante el identificador de WhatsApp.
- Registrar envíos fallidos y la respuesta de Meta.
- Proteger los endpoints privados mediante `x-api-key`.
- Verificar la firma `X-Hub-Signature-256` de Meta.
- Mostrar en `/health` qué partes de Meta todavía faltan configurar, sin revelar secretos.

## Estructura

```text
whatsapp-api/
├── src/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── tests/
│   └── utils/
├── sql/001_init.sql
├── Dockerfile
├── docker-compose.yml
├── render.yaml
├── openapi.yaml
└── .env.example
```

## Instalación local

Requisitos: Node.js 20 o superior, npm y PostgreSQL. Docker es opcional.

```bash
cp .env.example .env
npm install
docker compose up -d
npm run db:init
npm run dev
```

La API queda disponible en:

```text
http://localhost:3000
```

## Variables obligatorias del servidor

```env
API_KEY=clave-privada-de-32-caracteres-o-mas
DATABASE_URL=postgresql://usuario:clave@servidor:5432/base
DATABASE_SSL=false
```

## Variables de Meta

```env
META_GRAPH_VERSION=
META_APP_SECRET=
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_BUSINESS_ACCOUNT_ID=
WHATSAPP_VERIFY_TOKEN=
```

Estas variables pueden dejarse vacías para publicar y verificar la API. Los endpoints de envío devolverán `503` hasta que la conexión con Meta quede completa.

## Endpoints

### Estado de la API

```http
GET /health
```

No necesita API key. Informa si la base funciona y qué credenciales de Meta están configuradas.

### Enviar texto

```http
POST /api/v1/messages/text
Content-Type: application/json
x-api-key: TU_API_KEY
```

```json
{
  "to": "02920 15 123456",
  "body": "Hola, te escribimos de CityCred.",
  "previewUrl": false
}
```

### Enviar plantilla

```http
POST /api/v1/messages/template
Content-Type: application/json
x-api-key: TU_API_KEY
```

```json
{
  "to": "5492920123456",
  "templateName": "nombre_aprobado_en_meta",
  "languageCode": "es_AR",
  "components": []
}
```

### Marcar como leído

```http
POST /api/v1/messages/mark-read
Content-Type: application/json
x-api-key: TU_API_KEY
```

```json
{
  "messageId": "wamid..."
}
```

### Listar conversaciones

```http
GET /api/v1/conversations?limit=50
x-api-key: TU_API_KEY
```

### Historial de un contacto

```http
GET /api/v1/conversations/5492920123456/messages?limit=100
x-api-key: TU_API_KEY
```

### Webhook de Meta

```http
GET /webhooks/whatsapp
POST /webhooks/whatsapp
```

La dirección pública para Meta será:

```text
https://TU-DOMINIO/webhooks/whatsapp
```

## Comandos de comprobación

```bash
npm run test
npm run typecheck
npm run build
npm audit --omit=dev
```

## Reglas importantes de WhatsApp

- Fuera de la ventana de atención al cliente, se deben usar plantillas aprobadas.
- Las campañas requieren consentimiento de los destinatarios.
- Una respuesta HTTP exitosa confirma que Meta aceptó la solicitud; la entrega definitiva se actualiza posteriormente por webhook.
- Los tokens y secretos nunca deben colocarse en el frontend ni subirse al repositorio.

## Archivos de ayuda

- `CONFIGURACION_META.md`: conexión paso a paso con Meta.
- `PUBLICACION.md`: publicación del servidor y PostgreSQL.
- `openapi.yaml`: especificación técnica de la API.
