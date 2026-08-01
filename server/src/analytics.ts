type Meta = { key?: string; value?: unknown };
type LineItem = { name?: string; product_id?: number; quantity?: number; subtotal?: string; subtotal_tax?: string; total?: string; total_tax?: string };
type Refund = { total?: string };
type Fee = { total?: string; total_tax?: string };
type Address = { city?: string; state?: string; country?: string; postcode?: string };
export type AnalyticsOrder = {
  id: number; number?: string; status?: string; total?: string; discount_total?: string; discount_tax?: string;
  shipping_total?: string; shipping_tax?: string; total_tax?: string; date_created?: string; payment_method_title?: string;
  date_paid?: string | null;
  customer_id?: number; billing?: Address & { email?: string }; shipping?: Address; line_items?: LineItem[];
  fee_lines?: Fee[]; refunds?: Refund[]; meta_data?: Meta[];
};

export const defaultReportStatuses = ['processing', 'completed', 'refunded'];
const provinceNames: Record<string, string> = {
  C: 'Ciudad Autónoma de Buenos Aires', B: 'Buenos Aires', K: 'Catamarca', H: 'Chaco', U: 'Chubut',
  X: 'Córdoba', W: 'Corrientes', E: 'Entre Ríos', P: 'Formosa', Y: 'Jujuy', L: 'La Pampa',
  F: 'La Rioja', M: 'Mendoza', N: 'Misiones', Q: 'Neuquén', R: 'Río Negro', A: 'Salta',
  J: 'San Juan', D: 'San Luis', Z: 'Santa Cruz', S: 'Santa Fe', G: 'Santiago del Estero',
  V: 'Tierra del Fuego', T: 'Tucumán', 'AR-C': 'Ciudad Autónoma de Buenos Aires', 'AR-B': 'Buenos Aires',
};

const num = (value?: string | number) => Number(value || 0);
const round = (value: number) => Math.round(value * 100) / 100;

export function summarizeOrders(allOrders: AnalyticsOrder[], selectedStatuses = defaultReportStatuses) {
  const selected = new Set(selectedStatuses);
  const orders = allOrders.filter((order) => selected.has(order.status || ''));
  const revenueOrders = orders.filter((order) => order.status !== 'refunded');
  const validOrders = orders;
  const byStatus: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const payments: Record<string, number> = {};
  const products = new Map<number, { id: number; name: string; quantity: number; revenue: number }>();
  const financials = {
    productSubtotalExTax: 0, productSubtotalTax: 0, productNetExTax: 0, productTax: 0,
    discountsExTax: 0, discountTax: 0, shippingExTax: 0, shippingTax: 0,
    feesExTax: 0, feesTax: 0, taxesTotal: 0, chargedTotal: 0, refunds: 0, netCollected: 0,
    wooGrossSales: 0, wooNetSales: 0,
  };

  for (const order of orders) byStatus[order.status || 'desconocido'] = (byStatus[order.status || 'desconocido'] || 0) + 1;
  for (const order of orders) {
    const refundAmount = (order.refunds || []).reduce((sum, refund) => sum + Math.abs(num(refund.total)), 0);
    const orderNet = num(order.total) - refundAmount;
    const wooNet = order.status === 'refunded' ? 0 : orderNet - num(order.total_tax) - num(order.shipping_total);
    const day = order.date_created?.slice(0, 10) || 'sin-fecha';
    byDay[day] = (byDay[day] || 0) + wooNet;
    const method = order.payment_method_title || 'Sin especificar';
    payments[method] = (payments[method] || 0) + 1;
    financials.chargedTotal += num(order.total);
    financials.refunds += refundAmount;
    financials.discountsExTax += num(order.discount_total);
    financials.discountTax += num(order.discount_tax);
    if (order.status === 'refunded') continue;
    financials.shippingExTax += num(order.shipping_total);
    financials.shippingTax += num(order.shipping_tax);
    financials.taxesTotal += num(order.total_tax);
    for (const fee of order.fee_lines || []) {
      financials.feesExTax += num(fee.total);
      financials.feesTax += num(fee.total_tax);
    }
    for (const line of order.line_items || []) {
      financials.productSubtotalExTax += num(line.subtotal);
      financials.productSubtotalTax += num(line.subtotal_tax);
      financials.productNetExTax += num(line.total);
      financials.productTax += num(line.total_tax);
      const id = line.product_id || 0;
      const current = products.get(id) || { id, name: line.name || 'Producto', quantity: 0, revenue: 0 };
      current.quantity += line.quantity || 0;
      current.revenue += num(line.total);
      products.set(id, current);
    }
  }
  financials.netCollected = financials.chargedTotal - financials.refunds;
  financials.wooGrossSales = financials.netCollected;
  financials.wooNetSales = financials.wooGrossSales - financials.taxesTotal - financials.shippingExTax;
  Object.keys(financials).forEach((key) => { financials[key as keyof typeof financials] = round(financials[key as keyof typeof financials]); });
  const uniqueCustomers = new Set(validOrders.map((o) => o.customer_id || o.billing?.email).filter(Boolean)).size;
  const revenue = financials.wooNetSales;
  return {
    orders: orders.length, validOrders: validOrders.length, paidOrders: revenueOrders.length,
    revenue, averageTicket: orders.length ? revenue / orders.length : 0,
    discounts: financials.discountsExTax + financials.discountTax, shipping: financials.shippingExTax + financials.shippingTax,
    taxes: financials.taxesTotal, uniqueCustomers, financials, byStatus,
    byDay: Object.entries(byDay).sort(([a], [b]) => a.localeCompare(b)).map(([date, total]) => ({ date, total: round(total) })),
    payments: Object.entries(payments).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    topProducts: [...products.values()].map((p) => ({ ...p, revenue: round(p.revenue) })).sort((a, b) => b.quantity - a.quantity).slice(0, 10),
    attribution: summarizeAttribution(validOrders),
    geography: summarizeGeography(validOrders),
  };
}

function summarizeAttribution(orders: AnalyticsOrder[]) {
  const channels = new Map<string, Aggregate>();
  const sources = new Map<string, Aggregate>();
  const campaigns = new Map<string, Aggregate>();
  const devices = new Map<string, Aggregate>();
  const landingPages = new Map<string, Aggregate>();
  let attributedOrders = 0;
  for (const order of orders) {
    const { source, sourceRaw, medium, campaign, device, landing, channel } = orderDimensions(order);
    const refund = (order.refunds || []).reduce((sum, item) => sum + Math.abs(num(item.total)), 0);
    const value = order.status === 'refunded' ? 0 : num(order.total) - refund - num(order.total_tax) - num(order.shipping_total);
    if (sourceRaw !== 'unknown' || campaign || medium) attributedOrders++;
    addAggregate(channels, channel, value);
    addAggregate(sources, source, value);
    if (campaign) addAggregate(campaigns, campaign, value);
    addAggregate(devices, friendlyDevice(device), value);
    if (landing) addAggregate(landingPages, landing, value);
  }
  return {
    attributedOrders, attributionRate: orders.length ? round(attributedOrders / orders.length * 100) : 0,
    channels: aggregateList(channels), sources: aggregateList(sources), campaigns: aggregateList(campaigns, 12),
    devices: aggregateList(devices), landingPages: aggregateList(landingPages, 10),
  };
}

function summarizeGeography(orders: AnalyticsOrder[]) {
  const provinces = new Map<string, Aggregate>();
  const cities = new Map<string, Aggregate>();
  const postcodes = new Map<string, Aggregate>();
  for (const order of orders) {
    const { province, city, postcode } = orderDimensions(order);
    const refund = (order.refunds || []).reduce((sum, item) => sum + Math.abs(num(item.total)), 0);
    const value = order.status === 'refunded' ? 0 : num(order.total) - refund - num(order.total_tax) - num(order.shipping_total);
    addAggregate(provinces, province, value);
    addAggregate(cities, city, value);
    if (postcode) addAggregate(postcodes, postcode, value);
  }
  return { provinces: aggregateList(provinces, 12), cities: aggregateList(cities, 15), postcodes: aggregateList(postcodes, 12) };
}

export function orderDimensions(order: AnalyticsOrder) {
  const meta = metaMap(order.meta_data || []);
  const sourceType = text(meta, '_wc_order_attribution_source_type') || 'unknown';
  const sourceRaw = text(meta, '_wc_order_attribution_utm_source') || sourceFromReferrer(text(meta, '_wc_order_attribution_referrer')) || sourceType;
  const medium = text(meta, '_wc_order_attribution_utm_medium');
  const campaign = text(meta, '_wc_order_attribution_utm_campaign');
  const deviceRaw = text(meta, '_wc_order_attribution_device_type') || 'Desconocido';
  const landing = cleanLanding(text(meta, '_wc_order_attribution_session_entry'));
  const address = order.shipping?.city || order.shipping?.state ? order.shipping : order.billing;
  const provinceCode = address?.state || 'Sin provincia';
  const province = provinceNames[provinceCode] || provinceNames[`AR-${provinceCode}`] || provinceCode;
  const cityName = address?.city?.trim() || 'Sin ciudad';
  return {
    sourceRaw, source: friendlySource(sourceRaw), medium: medium || 'Sin medio', campaign: campaign || 'Sin campaña',
    channel: channelName(sourceRaw, medium, sourceType), device: friendlyDevice(deviceRaw), landing: landing || 'Sin landing',
    province, city: `${cityName} · ${province}`, postcode: address?.postcode || '',
  };
}

type Aggregate = { name: string; orders: number; revenue: number };
function addAggregate(map: Map<string, Aggregate>, name: string, revenue: number) {
  const clean = name.trim() || 'Sin identificar';
  const current = map.get(clean) || { name: clean, orders: 0, revenue: 0 };
  current.orders++; current.revenue += revenue; map.set(clean, current);
}
function aggregateList(map: Map<string, Aggregate>, limit = 20) {
  return [...map.values()].map((item) => ({ ...item, revenue: round(item.revenue), averageTicket: item.orders ? round(item.revenue / item.orders) : 0 }))
    .sort((a, b) => b.orders - a.orders || b.revenue - a.revenue).slice(0, limit);
}
function metaMap(items: Meta[]) { return new Map(items.map((item) => [item.key || '', item.value])); }
function text(map: Map<string, unknown>, key: string) { const value = map.get(key); return value === undefined || value === null ? '' : String(value).trim(); }
function sourceFromReferrer(value: string) { try { return value ? new URL(value).hostname.replace(/^www\./, '') : ''; } catch { return ''; } }
function cleanLanding(value: string) { try { const parsed = new URL(value); return parsed.pathname || '/'; } catch { return value.slice(0, 100); } }
function friendlySource(value: string) { if (!value || /^(unknown|typein|direct)$/i.test(value)) return 'Directo / sin identificar'; if (/emblue/i.test(value)) return 'emBlue'; if (/google/i.test(value)) return 'Google'; if (/facebook|fb|meta/i.test(value)) return 'Facebook / Meta'; if (/instagram/i.test(value)) return 'Instagram'; return value; }
function friendlyDevice(value: string) { const lower = value.toLowerCase(); if (lower.includes('mobile')) return 'Móvil'; if (lower.includes('desktop')) return 'Escritorio'; if (lower.includes('tablet')) return 'Tablet'; return value; }
function channelName(source: string, medium: string, type: string) {
  const value = `${source} ${medium} ${type}`.toLowerCase();
  if (/emblue|email|e-mail|newsletter/.test(value)) return 'Email';
  if (/(cpc|ppc|paid|ads|googleads)/.test(value)) return 'Publicidad paga';
  if (/instagram|facebook|fb|meta|social/.test(value)) return 'Redes sociales';
  if (/organic|google|bing|yahoo|search/.test(value)) return 'Búsqueda orgánica';
  if (/referral/.test(value) || (/https?:/.test(value) && !/typein|direct/.test(value))) return 'Referidos';
  if (/typein|direct|unknown/.test(value)) return 'Directo / sin identificar';
  return 'Otros';
}
