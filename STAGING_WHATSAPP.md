# Staging de WhatsApp CityCred

Este despliegue valida la API y PostgreSQL sin conectar Meta ni afectar el número real `7121`.

## Crear el staging

Usar el Blueprint raíz `render.yaml` mediante:

https://render.com/deploy?repo=https://github.com/santiago77582/citycred-app

El Blueprint crea:

- `citycred-whatsapp-api-staging`: servicio web Docker;
- `citycred-whatsapp-staging-db`: PostgreSQL de pruebas;
- una `API_KEY` generada por Render;
- ninguna credencial de Meta.

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

## Comprobación automática

En GitHub Actions ejecutar manualmente el workflow **WhatsApp API Staging Smoke Test** e ingresar la URL HTTPS del servicio. El workflow comprueba:

- salud de PostgreSQL;
- que Meta siga desconectado;
- que `/api/v1/**` rechace solicitudes sin `x-api-key`;
- que el webhook no acepte una verificación inválida.

## Límites

Los recursos gratuitos son únicamente para staging. No deben usarse para el tráfico real del `7121`, porque pueden suspenderse por inactividad y no reemplazan una política de respaldo de producción.

## Paso posterior

No cargar variables `META_*` ni configurar el webhook real hasta:

1. aprobar el staging;
2. elegir coexistencia o migración total;
3. definir un plan de reversión;
4. contratar recursos aptos para operación continua y backups.
