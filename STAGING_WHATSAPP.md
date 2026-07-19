# Staging de WhatsApp CityCred

Este despliegue valida la API y PostgreSQL sin conectar Meta ni afectar el número real `7121`.

## Estado de esta preparación

El repositorio deja listo el staging, pero **no crea recursos externos por sí solo**. En particular:

- `autoDeploy` está apagado;
- no hay credenciales ni placeholders `META_*`/`WHATSAPP_*` en los Blueprints de staging;
- bot, seguimientos, campañas, Flows, monitor y respaldos nacen apagados;
- CI construye y arranca el contenedor contra PostgreSQL efímero sin publicar la imagen.

Crear el Blueprint sigue siendo una acción externa. Debe hacerse únicamente después de confirmar el proveedor, la cuenta y cualquier condición de costo, incluso si el plan elegido figura como gratuito.

## Crear el staging después de esa confirmación

Usar el Blueprint raíz `render.yaml` mediante:

https://render.com/deploy?repo=https://github.com/santiago77582/citycred-app

El Blueprint crea:

- `citycred-whatsapp-api-staging`: servicio web Docker;
- `citycred-whatsapp-staging-db`: PostgreSQL de pruebas;
- una `API_KEY` generada por Render;
- ninguna credencial de Meta.

El primer despliegue y cada despliegue posterior son manuales. No habilitar Auto-Deploy desde el panel.

El repositorio es un monorepo. El servicio usa `rootDir: whatsapp-api`, construye `whatsapp-api/Dockerfile` y comprueba `/health`.

## Resultado esperado

Al finalizar el despliegue, abrir:

```text
https://NOMBRE-DEL-SERVICIO.onrender.com/health
```

Debe devolver HTTP 200 con:

- `status: "ok"`;
- `database: "ok"`;
- `meta.envioConfigurado: false`;
- `meta.webhookConfigurado: false`.
- `safety.safeMode: true`;
- todos los valores de `safety.features` en `false`.

## Comprobación automática

En GitHub Actions ejecutar manualmente el workflow **WhatsApp API Staging Smoke Test** e ingresar la URL HTTPS del servicio. El workflow comprueba:

- salud de PostgreSQL;
- que Meta siga desconectado;
- que bot, seguimientos, campañas, Flows, monitor, backups y restauraciones sigan apagados;
- que `/api/v1/**` rechace solicitudes sin `x-api-key`;
- que GET y POST del webhook no puedan activarse;
- que GET y POST de WhatsApp Flows permanezcan inactivos;
- que el servidor conserve encabezados HTTP de seguridad.

El workflow es exclusivamente manual: no acepta credenciales y sólo necesita el origen HTTPS público del staging, sin ruta ni parámetros.

## Validación previa sin hosting

Cada PR que cambia la API ejecuta dos trabajos:

1. pruebas, TypeScript, compilación y auditoría de dependencias;
2. construcción de la imagen Docker, migraciones sobre PostgreSQL 16 efímero, arranque y comprobación de `safety.safeMode`.

La imagen se usa únicamente dentro del runner y no se publica en ningún registro.

## Límites

Los recursos gratuitos son únicamente para staging. No deben usarse para el tráfico real del `7121`, porque pueden suspenderse por inactividad y no reemplazan una política de respaldo de producción.

## Paso posterior

No cargar variables `META_*` ni configurar el webhook real hasta:

1. aprobar el staging;
2. elegir coexistencia o migración total;
3. definir un plan de reversión;
4. contratar recursos aptos para operación continua y backups.
