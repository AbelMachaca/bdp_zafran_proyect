# Zafrán · Explorador WooCommerce

Panel local de solo lectura para consultar pedidos, productos, clientes, cupones, reembolsos, reportes y metadatos de WooCommerce.

La interfaz incluye modos claro y oscuro. La primera visita respeta la preferencia del sistema y luego conserva la selección realizada desde la barra superior.

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
EMBLUE_POST_PURCHASE_ENABLED=false
EMBLUE_POST_PURCHASE_URL=
EMBLUE_POST_PURCHASE_TOKEN=
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

## Reporte de email marketing y cupones

La sección **Email marketing** analiza un año completo y permite elegir el mes operativo. La comparación comienza apagada y puede activarse contra el mes anterior, el promedio de los tres meses anteriores o el mismo mes del año pasado. Incluye ventas y pedidos atribuidos a email/emBlue mediante los metadatos nativos de atribución de WooCommerce, pedidos influenciados por email, adopción mensual de cupones y un seguimiento destacado del cupón `¡hola20%!`.

El desglose de atribución muestra qué campañas, fuentes UTM, medios UTM, combinaciones source/medium, landing pages y dispositivos aportaron más pedidos y venta neta al canal email. También informa la cobertura de etiquetado para detectar campañas incompletas.

El ranking de cupones informa usos, clientes únicos, venta neta asociada, descuento otorgado, participación sobre los pedidos y variación interanual. Los estados contabilizados son configurables desde el panel.

```text
GET /api/email-marketing?year=2026&statuses=processing,completed,refunded
```

El reporte no estima envíos, aperturas, clics ni bajas: esas métricas requieren una futura conexión con la API de emBlue.

## Automatizaciones WooCommerce

Al iniciar con PostgreSQL configurado, el backend aplica migraciones versionadas de forma automática. Las migraciones crean contactos, pedidos, artículos, eventos de WooCommerce, trabajos programados e historial de intentos.

El receptor público es:

```text
POST https://api-zafran.amachaca.tech/webhooks/woocommerce/orders
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
GET /api/automations/jobs?page=1&per_page=25
```

El endpoint de trabajos admite los filtros `status`, `type` (`post_purchase`, `cross_sell` o `win_back`) y `search`. El frontend los presenta en la sección **Automatizaciones**, junto con consentimiento, fecha prevista, tiempo restante, pedido disparador, productos, categorías e historial del último intento.

Cross-sell se programa 35 días y Win-back 90 días exactos después de que el último pedido entra en `processing`. Una compra posterior reinicia ambos plazos. El consentimiento promocional del contacto es persistente: una aceptación previa no se revoca porque la casilla no se marque nuevamente en otro pedido; únicamente una baja explícita deberá desactivarlo.

Cada trabajo conserva las categorías originales de WooCommerce únicamente como referencia y agrega la clasificación que usará emBlue: `granolas`, `barras` o `sin_categoria_clara`. Si una compra contiene Granolas y Barras, `primary_marketing_category` se elige por el mayor importe acumulado; ante empate o ausencia de importes, por la mayor cantidad de unidades y, si todo empata, por el primer grupo que aparece en el pedido. También se incluyen `bought_granolas`, `bought_barras`, los importes y las cantidades acumuladas por grupo para simplificar y auditar el mapeo.

### Postcompra en emBlue Data Lab / Journeys

El envío de Postcompra utiliza el conector personalizado de Data Lab indicado por `EMBLUE_POST_PURCHASE_URL`. Con la opción **Sin autenticación adicional**, `EMBLUE_POST_PURCHASE_TOKEN` debe quedar vacío. Si luego se selecciona seguridad con API Token, esa variable contiene únicamente el token y el backend agrega `Authorization: Bearer ...`.

Hay dos seguros independientes y ambos deben estar activos para enviar:

```text
EMBLUE_ENABLED=true
EMBLUE_POST_PURCHASE_ENABLED=true
```

Primero se configura y prueba el mapeo manteniendo ambas variables en `false`. No se deben activar hasta que la URL completa y el Journey estén revisados. El JSON lleva los datos simples del contacto y pedido en el nivel superior —incluido `email`, que Data Lab exige— y `products` como arreglo de objetos para utilizarlo como campo dinámico en el Journey.

Cada trabajo se toma de forma exclusiva para evitar envíos simultáneos duplicados. Las respuestas se registran en `automation_attempts`; los fallos se reintentan hasta `EMBLUE_MAX_ATTEMPTS` con esperas progresivas. Cross-sell y Win-back permanecen en modo prueba hasta disponer de sus propios conectores.
