# Zafrán · Explorador WooCommerce

Panel local de solo lectura para consultar pedidos, productos, clientes, cupones, reembolsos, reportes y metadatos de WooCommerce.

La interfaz incluye modos claro y oscuro. La primera visita respeta la preferencia del sistema y luego conserva la selección realizada desde la barra superior.

## Configuración

1. Copiá `.env.example` como `server/.env`.
2. Completá `WC_CONSUMER_KEY`, `WC_CONSUMER_SECRET`, `PANEL_USERNAME` y `PANEL_PASSWORD` en `server/.env`. La contraseña del panel debe tener al menos 16 caracteres.
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

El explorador consulta WooCommerce mediante una lista cerrada de recursos GET. El panel requiere sesión; las rutas de login/logout, webhooks y automatizaciones tienen sus propios controles.

## Definiciones del dashboard

- **Estados predeterminados:** `processing` y `completed`. Reembolsado queda desmarcado y puede incluirse manualmente.
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
EMBLUE_POST_PURCHASE_ACTIVE_FROM=
EMBLUE_TIMEOUT_MS=12000
EMBLUE_MAX_ATTEMPTS=5
AUTOMATION_TEST_SECRET=generar_otra_clave_larga_y_aleatoria
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

La sección **Email marketing** analiza un año completo y permite elegir el mes operativo. La comparación comienza apagada y puede activarse contra el mes anterior completo, el mes anterior hasta el mismo día y hora argentina, el promedio de los tres meses anteriores o el mismo mes del año pasado. Incluye ventas y pedidos atribuidos a email/emBlue mediante los metadatos nativos de atribución de WooCommerce, pedidos influenciados por email, adopción mensual de cupones y un seguimiento destacado del cupón `¡hola20%!`.

El desglose de atribución muestra qué campañas, fuentes UTM, medios UTM, combinaciones source/medium, landing pages y dispositivos aportaron más pedidos y venta neta al canal email. También informa la cobertura de etiquetado para detectar campañas incompletas.

El ranking de cupones informa usos, clientes únicos, venta neta asociada, descuento otorgado, participación sobre los pedidos y variación interanual. Los estados contabilizados son configurables desde el panel.

```text
GET /api/email-marketing?year=2026&statuses=processing,completed
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

`AUTOMATIONS_ACTIVE_FROM` define desde cuándo se crean automatizaciones y evita generar trabajos retroactivos. Usá una fecha ISO 8601 con zona horaria argentina. Mientras `EMBLUE_ENABLED=false`, no se envía información a emBlue.

Los trabajos de Postcompra cuya fecha ya pasó al instalar esta versión se conservan con estado `expired` (**Vencido · no enviado**): siguen disponibles para auditoría en el frontend y el worker nunca los reclama. Además, `EMBLUE_POST_PURCHASE_ACTIVE_FROM` funciona como corte de seguridad al activar el conector; todo trabajo con fecha prevista anterior a ese instante también queda vencido. Definí esta variable con la fecha y hora real de activación, por ejemplo `2026-09-04T18:30:00-03:00`.

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

Hay tres seguros independientes y todos deben estar configurados para enviar trabajos reales:

```text
EMBLUE_ENABLED=true
EMBLUE_POST_PURCHASE_ENABLED=true
EMBLUE_POST_PURCHASE_ACTIVE_FROM=2026-09-04T18:30:00-03:00
```

Primero se configura y prueba el mapeo manteniendo ambas variables en `false`. No se deben activar hasta que la URL completa y el Journey estén revisados. El JSON lleva los datos simples del contacto y pedido en el nivel superior —incluido `email`, que Data Lab exige— y `products` como arreglo de objetos para utilizarlo como campo dinámico en el Journey.

Cada trabajo se toma de forma exclusiva para evitar envíos simultáneos duplicados. Las respuestas se registran en `automation_attempts`; los fallos se reintentan hasta `EMBLUE_MAX_ATTEMPTS` con esperas progresivas. Cross-sell y Win-back permanecen en modo prueba hasta disponer de sus propios conectores.

### Prueba manual de Postcompra

La sección **Automatizaciones** incluye el botón **Probar Postcompra**. Abre un formulario editable para simular el contacto, pedido, producto y segmento; muestra una vista previa y envía el mismo contrato JSON que utilizará el worker. La prueba es inmediata e independiente: no crea ni consume trabajos de la cola y funciona aunque `EMBLUE_ENABLED` y `EMBLUE_POST_PURCHASE_ENABLED` permanezcan en `false`.

Para proteger el endpoint público, generá una clave distinta del secreto de WooCommerce y guardala únicamente en las variables del backend de Easypanel:

```text
AUTOMATION_TEST_SECRET=una_clave_larga_y_aleatoria
```

El panel solicita esa clave al abrir la prueba y la envía en el header `X-Automation-Test-Secret`; no queda incluida en el JavaScript compilado. Hay un límite de cinco pruebas por minuto y cada resultado queda auditado en `automation_test_deliveries`. El endpoint utilizado es:

```text
POST /api/automations/test/post-purchase
```

## Consultas y actualización de reportes

- Resumen y Origen y zonas incluyen **Mes completo**, que completa Desde y Hasta con el primer y último día del mes elegido.
- Los rangos completos de pedidos se reutilizan durante 60 segundos, incluso entre reportes y consultas simultáneas. Se conservan hasta 24 rangos en memoria; reiniciar el servidor vacía esta caché.
- **Actualizar**, **Analizar** y **Actualizar reporte** envían `refresh=true` para consultar nuevamente WooCommerce e invalidar rangos guardados superpuestos. No hay sincronización automática en segundo plano.
- Las consultas usan solo los campos necesarios para los informes, un máximo global de cinco solicitudes simultáneas y un tiempo máximo de 30 segundos por solicitud. Los informes recorren todas las páginas y ya no se truncan en 5.000 pedidos. La primera consulta de un período amplio sigue dependiendo de la velocidad de la tienda.
- **Mismo día y hora** recorta ambos meses al día y hora actuales de Argentina y muestra los dos rangos exactos. También puede usarse sobre meses históricos; si un mes tiene menos días, ambos se limitan al último día común. Los gráficos y tablas anuales mantienen sus meses completos. **Mes anterior completo** conserva el mes analizado y lo compara con todo el mes previo, incluso diciembre del año anterior al analizar enero.

## Acceso privado al panel

En **Easypanel → aplicación backend → Variables de entorno**, configurá:

```env
PANEL_USERNAME=tu_usuario
PANEL_PASSWORD=una_contraseña_unica_aleatoria_de_al_menos_16_caracteres
CLIENT_ORIGIN=https://dominio-publico-del-frontend
```

Elegí tu propia contraseña; no uses el ejemplo. El usuario distingue mayúsculas y minúsculas. La contraseña admite entre 16 y 1024 caracteres. `CLIENT_ORIGIN` debe coincidir con el origen del navegador (protocolo, dominio y puerto). En producción se exige HTTPS. No agregues estas credenciales a variables `VITE_*`, al frontend ni a Git.

Desplegá backend y frontend. Sin credenciales válidas o con un origen HTTP en producción, el backend mantiene cerrado el acceso. Localmente usá `CLIENT_ORIGIN=http://localhost:5173` y entrá por esa misma dirección.

- Se permite una sola cuenta administrada por variables de entorno. Después de 10 intentos fallidos en una ventana de 15 minutos, se bloquean nuevos ingresos durante 15 minutos desde el décimo fallo. El límite es compartido por toda la cuenta, incluso si se cambian el usuario introducido o los headers de IP. Esto también puede bloquear temporalmente al usuario legítimo; las sesiones ya iniciadas continúan funcionando.
- Las sesiones utilizan tokens aleatorios de 256 bits; el servidor conserva solo su hash. La cookie es `HttpOnly`, `SameSite=Strict`, sin dominio compartido y con `Secure` y prefijo `__Host-` sobre HTTPS. No se guardan credenciales ni tokens en localStorage.
- La sesión se conserva durante **90 días desde el ingreso**, incluso sin actividad y al cerrar y volver a abrir el navegador. La actividad no renueva el plazo. **Cerrar sesión** revoca el token en el servidor. Cambiar el usuario o la contraseña invalida los tokens existentes al redesplegar. Borrar cookies o usar navegación privada puede requerir ingresar antes.
- Las solicitudes que modifican estado requieren el origen exacto del frontend, además de la cookie. Login usa JSON y mensajes genéricos para usuario o contraseña incorrectos. Las respuestas de autenticación y de la API llevan `Cache-Control: no-store`.
- Todas las rutas `/api` de datos y automatizaciones requieren sesión. `/api/health` permanece público y solo devuelve `{ "ok": true }` para el healthcheck. La configuración del panel se consulta en `/api/status`, con sesión. Los endpoints `/api/auth/session`, `/api/auth/login` y `/api/auth/logout` permiten administrar la sesión.
- `/webhooks/woocommerce/orders` mantiene su firma HMAC de WooCommerce y no requiere la cookie del panel. La prueba de Postcompra exige tanto la sesión como `X-Automation-Test-Secret`.

**Almacenamiento y réplicas:** las sesiones se guardan en PostgreSQL (tabla `panel_sessions`, migración 7 automática al iniciar). Se conserva únicamente un hash HMAC del token vinculado a las credenciales, junto con su vencimiento; nunca la contraseña ni el token original. Con la misma base y credenciales, los reinicios y redespliegues conservan las sesiones. En producción PostgreSQL es obligatorio: sin configuración de base de datos, el acceso queda cerrado. Usá la conexión `DATABASE_URL` o `DB_*` ya configurada en Easypanel. En desarrollo sin PostgreSQL se usa memoria y los reinicios borran las sesiones. El contador de intentos sigue en memoria y se reinicia con el servicio; mantené **una sola réplica del backend** hasta trasladar también ese contador a un almacén compartido.

Los controles de cookies, sesiones y limitación de intentos siguen las recomendaciones de [sesiones de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) y [autenticación de OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
