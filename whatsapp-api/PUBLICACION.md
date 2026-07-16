# Publicación de la API

La API necesita tres componentes permanentes:

1. un servidor Node.js con HTTPS;
2. PostgreSQL;
3. una dirección pública estable para el webhook.

## Publicación con Docker

```bash
docker build -t citycred-whatsapp-api .
docker run --rm -p 3000:3000 --env-file .env citycred-whatsapp-api
```

Al iniciar, el contenedor ejecuta automáticamente el SQL de creación de tablas antes de abrir el servidor.

## Publicación mediante Blueprint

El archivo `render.yaml` describe:

- una base PostgreSQL;
- un servicio web Docker;
- la conexión automática entre ambos;
- variables privadas que deben cargarse desde el panel del hosting.

Después de importar el repositorio en el proveedor, deben completarse manualmente las variables de Meta. No deben escribirse en `render.yaml`.

## Comprobación después de publicar

```bash
curl https://DOMINIO/health
```

Resultado esperado antes de conectar Meta:

```json
{
  "status": "ok",
  "database": "ok",
  "meta": {
    "sendingConfigured": false,
    "webhookConfigured": false
  }
}
```

Después de cargar las credenciales, ambos valores deben ser `true`.

## Copias de seguridad

- Activar respaldos automáticos de PostgreSQL.
- Mantener el repositorio sin archivos `.env`.
- Guardar una copia segura de la configuración empresarial de Meta.
- Probar restauraciones periódicamente.
