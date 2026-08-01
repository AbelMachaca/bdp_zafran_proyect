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
