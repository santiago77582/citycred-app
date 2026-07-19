# Seguridad de publicación y conexión del 7121

Este documento separa claramente la **prueba técnica** de la **conexión del número real**.

## 1. Publicación inicial: staging sin Meta

El Blueprint gratuito de Render se usa únicamente para comprobar:

- construcción del contenedor;
- arranque de PostgreSQL;
- inicialización de tablas;
- respuesta de `/health`;
- autenticación por `x-api-key`;
- verificación GET del webhook con un token de prueba;
- rechazo de firmas inválidas.
- confirmación pública de `safety.safeMode: true`;
- bot, seguimientos, campañas, Flows, monitor, backups y restauración apagados.

En esta etapa deben quedar vacías las variables de Meta:

- `META_APP_SECRET`;
- `WHATSAPP_ACCESS_TOKEN`;
- `WHATSAPP_PHONE_NUMBER_ID`;
- `WHATSAPP_BUSINESS_ACCOUNT_ID`.

No configurar todavía el callback en Meta y no tocar el webhook anterior.

Los Blueprints de staging tienen `autoDeploy: false`. Importarlos crea recursos externos y requiere una confirmación separada de cuenta, proveedor y costos; este repositorio no los crea automáticamente.

## 2. Limitaciones del plan gratuito

El plan gratuito de Render no es adecuado para operar el número real:

- el servicio web puede dormirse por inactividad y tardar en volver a responder;
- la base PostgreSQL gratuita vence a los 30 días;
- la base gratuita no incluye copias de seguridad administradas.

Por eso, el Blueprint gratuito debe tratarse como un entorno temporal de validación. Antes de conectar el 7121 se necesita un servicio siempre activo y una base persistente con respaldo.

Referencia: https://render.com/docs/free

## 3. Decisión obligatoria sobre el 7121

El número `+54 9 291 471-7121` continúa registrado en la aplicación de WhatsApp Business del teléfono. Antes de vincularlo a la Cloud API, Santiago debe elegir y comprobar con Meta una de estas modalidades:

1. **Coexistencia:** aplicación del teléfono y Cloud API funcionando con el mismo número.
2. **Migración total:** el número pasa a Cloud API y deja de operar desde la aplicación actual.

No ejecutar ninguna migración, registro ni eliminación hasta documentar el procedimiento y el plan de reversión.

## 4. Condiciones para cambiar el webhook

El webhook de Meta solo puede cambiarse cuando se cumplan todas estas condiciones:

- `/health` responde correctamente con la base operativa;
- el servidor está en un plan apto para producción;
- las credenciales fueron cargadas como secretos privados;
- el GET de verificación funciona;
- las firmas inválidas son rechazadas;
- existe un método probado para consultar mensajes y estados guardados;
- se anotó la URL anterior para poder revertir;
- se definió una ventana de prueba controlada.

## 5. Prueba real mínima

No declarar la integración terminada hasta demostrar:

1. envío real desde la API;
2. estado `sent` o `delivered` recibido por webhook;
3. respuesta real desde el teléfono receptor;
4. mensaje entrante guardado en PostgreSQL;
5. consulta del historial mediante la API;
6. reversión disponible si alguna etapa falla.

## 6. Secretos

Nunca guardar tokens, App Secret, API keys ni contraseñas en GitHub, documentación, capturas o chats. Santiago debe pegarlos personalmente en las variables privadas del hosting.
