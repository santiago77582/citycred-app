# Operación de mensajes con estado `UNKNOWN`

## Cuándo se usa

Un envío queda en `UNKNOWN` cuando la API no puede demostrar si Meta aceptó o no el mensaje. Ejemplos:

- timeout o corte de red después de iniciar la solicitud;
- respuesta HTTP 5xx de Meta en un envío;
- respuesta HTTP 2xx sin JSON válido;
- respuesta HTTP 2xx válida pero sin `messages[0].id` (`wamid`).

En estos casos **no se reintenta automáticamente**. Reenviar podría producir dos mensajes al mismo cliente.

## Respuesta de la API

La API responde HTTP `202` y guarda el intento en PostgreSQL:

```json
{
  "messageId": "uuid-interno",
  "wamid": null,
  "to": "549291...",
  "status": "UNKNOWN",
  "retrySafe": false,
  "warning": "No se pudo confirmar si Meta aceptó el envío..."
}
```

`messageId` es el identificador interno de CityCred. Debe guardarse en el sistema que llamó a la API para poder ubicar el intento posteriormente.

## Regla para el sistema cliente

- No volver a enviar automáticamente.
- Mostrar el intento como “resultado pendiente de confirmar”.
- Conservar `messageId`, destinatario, fecha, tipo de mensaje y usuario que inició el envío.
- Permitir un nuevo envío únicamente después de una decisión humana informada.

## Limitación de conciliación

Los estados posteriores de WhatsApp (`sent`, `delivered`, `read`, `failed`) se relacionan mediante `wamid`.

Cuando Meta no devolvió ese identificador, un webhook posterior no puede vincularse automáticamente con la fila `UNKNOWN`. La fila permanece como evidencia del intento y debe revisarse usando:

1. el identificador interno `messageId`;
2. la hora exacta del intento;
3. el destinatario;
4. los registros del servidor;
5. las herramientas de Meta disponibles para la cuenta.

No se debe cambiar manualmente el estado sin dejar evidencia de quién realizó la conciliación y por qué.

## Trabajo pendiente antes de producción masiva

Se requiere una herramienta administrativa protegida para:

- listar envíos `UNKNOWN`;
- registrar la investigación realizada;
- marcarlos como confirmados, fallidos o descartados;
- asociar un `wamid` cuando pueda recuperarse;
- mantener auditoría de usuario, fecha y motivo.

Hasta que esa herramienta exista, los `UNKNOWN` deben tratarse manualmente y el volumen de pruebas debe mantenerse bajo y controlado.
