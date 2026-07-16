# Configuración de Meta y WhatsApp

## Datos que se necesitan

Desde Meta Developers y el Administrador de WhatsApp deben obtenerse:

1. versión de Graph API indicada por la aplicación;
2. App Secret;
3. token permanente o de usuario del sistema;
4. Phone Number ID;
5. WhatsApp Business Account ID;
6. número comercial que se conectará;
7. una plantilla aprobada para la primera prueba fuera de la ventana de atención.

No guardar estos valores en GitHub, archivos públicos, frontend o mensajes compartidos.

## Preparación

1. Crear o seleccionar una aplicación empresarial en Meta Developers.
2. Agregar el producto WhatsApp.
3. Vincular la cuenta de WhatsApp Business de CityCred.
4. Agregar o migrar el número que se utilizará con la Cloud API.
5. Crear un usuario del sistema en la configuración empresarial cuando se requiera un token permanente.
6. Asignar los activos y permisos necesarios a ese usuario.
7. Generar el token y guardarlo únicamente como variable privada del servidor.

## Variables

Cargar en el hosting:

```env
META_GRAPH_VERSION=vXX.X
META_APP_SECRET=valor_privado
WHATSAPP_ACCESS_TOKEN=valor_privado
WHATSAPP_PHONE_NUMBER_ID=valor
WHATSAPP_BUSINESS_ACCOUNT_ID=valor
WHATSAPP_VERIFY_TOKEN=valor-privado-elegido-por-citycred
```

`WHATSAPP_VERIFY_TOKEN` no lo entrega Meta: es una clave privada elegida para comprobar el webhook. Debe tener exactamente el mismo valor en Meta y en el servidor.

## Webhook

Después de publicar la API:

1. abrir la configuración de WhatsApp en Meta Developers;
2. entrar en Webhooks o Configuration;
3. colocar como callback:

```text
https://DOMINIO-PUBLICO/webhooks/whatsapp
```

4. colocar el mismo `WHATSAPP_VERIFY_TOKEN` del servidor;
5. verificar la dirección;
6. suscribir el campo `messages` de la cuenta de WhatsApp Business.

## Primera prueba

1. Abrir `https://DOMINIO-PUBLICO/health`.
2. Confirmar que `database` indique `ok`.
3. Confirmar que `sendingConfigured` y `webhookConfigured` sean `true`.
4. Usar una plantilla aprobada y un número autorizado para la primera prueba.
5. Enviar una respuesta desde el teléfono receptor.
6. Consultar el historial mediante el endpoint de conversaciones.
7. Verificar que el estado cambie de `SENT` a `DELIVERED` o `READ` por webhook.

## Seguridad

- Rotar inmediatamente cualquier secreto que haya sido publicado accidentalmente.
- Usar autenticación de dos factores en Meta Business.
- Limitar quién puede administrar la aplicación y los usuarios del sistema.
- Utilizar siempre HTTPS.
- No revelar la `API_KEY` del servidor al navegador público.
