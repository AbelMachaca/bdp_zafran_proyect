# Zafrán · Explorador WooCommerce

Panel local de solo lectura para consultar pedidos, productos, clientes, cupones, reembolsos, reportes y metadatos de WooCommerce.

## Configuración

1. Copiá `.env.example` como `server/.env`.
2. Completá `WC_CONSUMER_KEY` y `WC_CONSUMER_SECRET` en `server/.env`.
3. Ejecutá `npm install`.
4. Ejecutá `npm run dev`.
5. Abrí `http://localhost:5173`.

Las credenciales solo son leídas por el backend. El frontend nunca las recibe.

## Comandos

- `npm run dev`: inicia backend y frontend.
- `npm run build`: valida y compila ambos proyectos.
- `npm test`: ejecuta pruebas del backend.
- `npm start`: inicia el backend compilado.

## Alcance

La aplicación no contiene rutas de escritura. El explorador usa una lista cerrada de recursos GET para impedir mutaciones accidentales.

## Definiciones del dashboard

- **Criterio WooCommerce (predeterminado):** estados `processing`, `completed` y `refunded`, igual que el informe nativo de la tienda.
- **Ventas brutas de WooCommerce:** total vendido con impuestos y envío, después de reembolsos.
- **Ventas netas de WooCommerce:** ventas brutas menos impuestos y envío.
- Los estados se pueden activar o desactivar; cuando se usa una selección personalizada, el panel reconstruye los importes desde los pedidos.
- “Mes anterior” conserva los mismos días del mes seleccionado; “Año anterior” conserva las mismas fechas del año previo. También se admite un rango comparativo personalizado.
- La atribución se obtiene de los campos nativos `_wc_order_attribution_*` guardados en cada pedido.

## Docker y Easypanel

El repositorio contiene dos imágenes independientes para crear dos aplicaciones dentro del mismo proyecto de Easypanel:

- `Dockerfile.backend`: API Node.js/Express, puerto interno `3001`.
- `Dockerfile.frontend`: React compilado y servido por Nginx, puerto interno `80`.

### Aplicación backend

Configuración de compilación:

- Método: `Dockerfile`.
- Contexto: raíz del repositorio (`.`).
- Ruta: `Dockerfile.backend`.
- Puerto interno: `3001`.
- Healthcheck HTTP: `/api/health`.

Variables del backend:

```env
WC_STORE_URL=https://zafran.com.ar
WC_CONSUMER_KEY=ck_reemplazar
WC_CONSUMER_SECRET=cs_reemplazar
DATABASE_URL=postgresql://usuario:password@host-interno-postgres:5432/base
DB_SSL=false
PORT=3001
CLIENT_ORIGIN=https://dominio-publico-del-frontend
WC_WEBHOOK_SECRET=generar_un_secreto_aleatorio
AUTOMATIONS_ACTIVE_FROM=2026-08-01T18:00:00-03:00
EMBLUE_ENABLED=false
```

No copies `server/.env` al contenedor. Cargá los valores reales desde las variables de entorno de Easypanel. Para PostgreSQL usá la URL interna del servicio cuando ambos estén en el mismo proyecto.

### Aplicación frontend

Configuración de compilación:

- Método: `Dockerfile`.
- Contexto: raíz del repositorio (`.`).
- Ruta: `Dockerfile.frontend`.
- Puerto interno: `80`.

El frontend no necesita una variable con la URL del backend. React solicita `/api` al mismo dominio del frontend y Nginx reenvía internamente esas solicitudes a `http://bdp-cuentas_backend_zafran:3001`. El hostname interno no queda incluido en el JavaScript enviado al navegador.

Una vez desplegado, podés validar PostgreSQL desde la consola del servicio:

```sh
npm run db:test:prod -w server
```

## Automatizaciones WooCommerce

Al iniciar con PostgreSQL configurado, el backend aplica migraciones versionadas de forma automática. Las migraciones crean contactos, pedidos, artículos, eventos de WooCommerce, trabajos programados e historial de intentos.

El receptor público es:

```text
POST https://bdp-cuentas-backend-zafran.i8mj7w.easypanel.host/webhooks/woocommerce/orders
```

En WooCommerce deben crearse dos webhooks con esa misma URL y el mismo secreto:

- `Pedido creado` (`order.created`).
- `Pedido actualizado` (`order.updated`).

No actives los webhooks antes de desplegar el receptor. WooCommerce y Easypanel deben compartir exactamente el valor de `WC_WEBHOOK_SECRET`.

`AUTOMATIONS_ACTIVE_FROM` define el inicio de la automatización y evita generar trabajos retroactivos. Usá una fecha ISO 8601 con zona horaria argentina. Mientras `EMBLUE_ENABLED=false`, los trabajos vencidos pasan a `ready` y no se envía información a emBlue.

Comprobaciones disponibles:

```text
GET /api/health
GET /api/automations/status
GET /api/automations/jobs?limit=50
```
