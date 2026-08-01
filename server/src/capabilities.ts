export type Capability = {
  id: string;
  group: string;
  title: string;
  description: string;
  path: string;
  probe?: boolean;
  sensitive?: boolean;
};

export const capabilities: Capability[] = [
  { id: 'orders', group: 'Ventas', title: 'Pedidos', description: 'Estados, fechas, importes, direcciones, productos, cupones, pagos, envíos y metadatos.', path: 'orders', probe: true, sensitive: true },
  { id: 'order-notes', group: 'Ventas', title: 'Notas de pedidos', description: 'Historial interno, avisos al cliente y eventos generados por pasarelas.', path: 'orders/{id}/notes', sensitive: true },
  { id: 'refunds', group: 'Ventas', title: 'Reembolsos', description: 'Importes, motivos, líneas reembolsadas y fechas.', path: 'refunds', probe: true, sensitive: true },
  { id: 'coupons', group: 'Ventas', title: 'Cupones', description: 'Códigos, descuentos, límites, vencimientos y cantidad de usos.', path: 'coupons', probe: true },
  { id: 'products', group: 'Catálogo', title: 'Productos', description: 'SKU, precios, stock, imágenes, categorías, atributos, dimensiones y metadatos.', path: 'products', probe: true },
  { id: 'variations', group: 'Catálogo', title: 'Variaciones', description: 'Atributos, stock, precios y SKU por variación.', path: 'products/{id}/variations' },
  { id: 'categories', group: 'Catálogo', title: 'Categorías', description: 'Jerarquía, imágenes y cantidad de productos.', path: 'products/categories', probe: true },
  { id: 'brands', group: 'Catálogo', title: 'Marcas', description: 'Marcas registradas en el catálogo.', path: 'products/brands', probe: true },
  { id: 'reviews', group: 'Catálogo', title: 'Reseñas', description: 'Calificaciones, contenido, producto y estado de aprobación.', path: 'products/reviews', probe: true, sensitive: true },
  { id: 'customers', group: 'Clientes', title: 'Clientes', description: 'Perfil, pedidos, gasto acumulado, direcciones y metadatos.', path: 'customers', probe: true, sensitive: true },
  { id: 'reports', group: 'Analítica', title: 'Reportes de ventas', description: 'Ventas, pedidos, clientes, cupones y productos más vendidos.', path: 'reports/sales', probe: true },
  { id: 'gateways', group: 'Configuración', title: 'Pasarelas de pago', description: 'Mercado Pago y demás métodos habilitados, título y estado.', path: 'payment_gateways', probe: true },
  { id: 'shipping', group: 'Configuración', title: 'Envíos', description: 'Zonas, métodos, clases y configuraciones de envío.', path: 'shipping/zones', probe: true },
  { id: 'taxes', group: 'Configuración', title: 'Impuestos', description: 'Tasas, clases, prioridades y regiones.', path: 'taxes', probe: true },
  { id: 'system', group: 'Diagnóstico', title: 'Estado del sistema', description: 'Versiones, entorno, base de datos, tema y plugins visibles.', path: 'system_status', probe: true, sensitive: true },
];

export const explorerResources: Record<string, string> = {
  orders: 'orders', products: 'products', customers: 'customers', coupons: 'coupons',
  refunds: 'refunds', categories: 'products/categories', tags: 'products/tags',
  brands: 'products/brands', reviews: 'products/reviews', reports: 'reports/sales',
  gateways: 'payment_gateways', shipping: 'shipping/zones', taxes: 'taxes',
  currencies: 'data/currencies', countries: 'data/countries', system: 'system_status',
};
