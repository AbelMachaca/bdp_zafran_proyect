type Meta = { key?: string; value?: unknown };
type LineItem = { name?: string; product_id?: number; quantity?: number; subtotal?: string; subtotal_tax?: string; total?: string; total_tax?: string };
type Refund = { total?: string };
type Fee = { total?: string; total_tax?: string };
type CouponLine = { code?: string; discount?: string; discount_tax?: string };
type Address = { city?: string; state?: string; country?: string; postcode?: string };
export type AnalyticsOrder = {
  id: number; number?: string; status?: string; total?: string; discount_total?: string; discount_tax?: string;
  shipping_total?: string; shipping_tax?: string; total_tax?: string; date_created?: string; payment_method_title?: string;
  date_paid?: string | null;
  customer_id?: number; billing?: Address & { email?: string }; shipping?: Address; line_items?: LineItem[];
  fee_lines?: Fee[]; refunds?: Refund[]; coupon_lines?: CouponLine[]; meta_data?: Meta[];
};

const monthFormatter = new Intl.DateTimeFormat('es-AR', { month: 'short', timeZone: 'UTC' });

export const defaultReportStatuses = ['processing', 'completed'];
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

export function summarizeEmailMarketing(
  currentOrders: AnalyticsOrder[], previousOrders: AnalyticsOrder[], year: number,
  selectedStatuses = defaultReportStatuses, primaryCoupon = '¡hola20%!', previousFullYearOrders = previousOrders,
) {
  const statuses = new Set(selectedStatuses);
  const current = currentOrders.filter((order) => statuses.has(order.status || ''));
  const previous = previousOrders.filter((order) => statuses.has(order.status || ''));
  const previousFullYear = previousFullYearOrders.filter((order) => statuses.has(order.status || ''));
  const primaryKey = normalizeCoupon(primaryCoupon);
  const currentSummary = summarizeMarketingPeriod(current, year, primaryKey);
  const previousSummary = summarizeMarketingPeriod(previous, year - 1, primaryKey);
  const previousMonthlySummary = summarizeMarketingPeriod(previousFullYear, year - 1, primaryKey);
  const previousCoupons = new Map(previousSummary.coupons.map((coupon) => [coupon.key, coupon]));

  return {
    year,
    primaryCoupon,
    overview: {
      storeOrders: currentSummary.storeOrders,
      storeRevenue: currentSummary.storeRevenue,
      couponOrders: currentSummary.couponOrders,
      couponUsageRate: percent(currentSummary.couponOrders, currentSummary.storeOrders),
      emailAttributed: compareMetric(currentSummary.emailAttributed, previousSummary.emailAttributed, currentSummary),
      emailInfluenced: compareMetric(currentSummary.emailInfluenced, previousSummary.emailInfluenced, currentSummary),
    },
    primary: compareCoupon(currentSummary.primary, previousSummary.primary, currentSummary.storeOrders),
    emailBreakdown: currentSummary.emailBreakdown,
    emailCoverage: currentSummary.emailCoverage,
    months: currentSummary.months.map((month, index) => {
      const previousMonth = previousMonthlySummary.months[index]!;
      return ({
      ...month,
      previous: previousMonth,
      delta: {
        emailOrders: percentageDeltaValue(month.emailOrders, previousMonth.emailOrders),
        influencedOrders: percentageDeltaValue(month.influencedOrders, previousMonth.influencedOrders),
        couponUses: percentageDeltaValue(month.couponUses, previousMonth.couponUses),
        primaryCouponUses: percentageDeltaValue(month.primaryCouponUses, previousMonth.primaryCouponUses),
      },
    }); }),
    coupons: currentSummary.coupons.map((coupon) =>
      compareCoupon(coupon, previousCoupons.get(coupon.key) || emptyCoupon(coupon.code), currentSummary.storeOrders),
    ),
    methodology: {
      emailAttribution: 'Origen, medio, tipo o campaña del pedido contiene emBlue, email, e-mail o newsletter.',
      influenced: `Pedido atribuido a email o que utilizó ${primaryCoupon}; cada pedido se cuenta una sola vez.`,
      revenue: 'Venta del pedido descontando reembolsos, impuestos y envío.',
    },
  };
}

function summarizeMarketingPeriod(orders: AnalyticsOrder[], year: number, primaryKey: string) {
  const months = Array.from({ length: 12 }, (_, month) => ({
    month: month + 1, label: monthFormatter.format(new Date(Date.UTC(year, month, 1))),
    storeOrders: 0, storeRevenue: 0, emailOrders: 0, emailRevenue: 0, influencedOrders: 0, influencedRevenue: 0,
    couponOrders: 0, couponUses: 0, couponDiscount: 0, primaryCouponUses: 0, primaryCouponRevenue: 0, primaryCouponDiscount: 0,
  }));
  const monthlyPrimaryCustomers = Array.from({ length: 12 }, () => new Set<string>());
  const coupons = new Map<string, ReturnType<typeof emptyCoupon> & { customers: Set<string> }>();
  const emailSources = new Map<string, Aggregate>(); const emailMediums = new Map<string, Aggregate>();
  const emailCampaigns = new Map<string, Aggregate>(); const emailLandings = new Map<string, Aggregate>();
  const emailDevices = new Map<string, Aggregate>(); const emailSourceMedium = new Map<string, Aggregate>();
  const emailCoverage = { source: 0, medium: 0, campaign: 0, landing: 0 };
  let storeRevenue = 0; let couponOrders = 0;
  const emailAttributed = { orders: 0, revenue: 0 };
  const emailInfluenced = { orders: 0, revenue: 0 };
  const primary = { ...emptyCoupon('¡hola20%!'), customers: new Set<string>() };

  for (const order of orders) {
    const monthIndex = Math.max(0, Math.min(11, Number(order.date_created?.slice(5, 7) || 1) - 1));
    const month = months[monthIndex]!;
    const revenue = orderRevenue(order);
    const lines = uniqueCouponLines(order.coupon_lines || []);
    const dimensions = orderDimensions(order);
    const attributed = isEmailDimensions(dimensions);
    const hasPrimary = lines.some((line) => normalizeCoupon(line.code || '') === primaryKey);
    const influenced = attributed || hasPrimary;
    const customer = String(order.customer_id || order.billing?.email?.trim().toLowerCase() || `order:${order.id}`);
    storeRevenue += revenue; month.storeOrders++; month.storeRevenue += revenue;
    if (attributed) {
      emailAttributed.orders++; emailAttributed.revenue += revenue; month.emailOrders++; month.emailRevenue += revenue;
      addAggregate(emailSources, dimensions.source, revenue); addAggregate(emailMediums, dimensions.medium, revenue);
      addAggregate(emailDevices, dimensions.device, revenue); addAggregate(emailSourceMedium, `${dimensions.source} · ${dimensions.medium}`, revenue);
      if (dimensions.campaign !== 'Sin campaña') addAggregate(emailCampaigns, dimensions.campaign, revenue);
      if (dimensions.landing !== 'Sin landing') addAggregate(emailLandings, dimensions.landing, revenue);
      if (dimensions.sourceRaw !== 'unknown') emailCoverage.source++;
      if (dimensions.medium !== 'Sin medio') emailCoverage.medium++;
      if (dimensions.campaign !== 'Sin campaña') emailCoverage.campaign++;
      if (dimensions.landing !== 'Sin landing') emailCoverage.landing++;
    }
    if (influenced) { emailInfluenced.orders++; emailInfluenced.revenue += revenue; month.influencedOrders++; month.influencedRevenue += revenue; }
    if (lines.length) { couponOrders++; month.couponOrders++; }
    for (const line of lines) {
      const code = line.code?.trim() || 'Sin código'; const key = normalizeCoupon(code);
      const item = coupons.get(key) || { ...emptyCoupon(code), key, customers: new Set<string>() };
      const discount = num(line.discount) + num(line.discount_tax);
      item.uses++; item.revenue += revenue; item.discount += discount; item.customers.add(customer);
      item.firstUsed = earlier(item.firstUsed, order.date_created); item.lastUsed = later(item.lastUsed, order.date_created);
      coupons.set(key, item);
      month.couponUses++; month.couponDiscount += discount;
      if (key === primaryKey) {
        primary.uses++; primary.revenue += revenue; primary.discount += discount; primary.customers.add(customer);
        primary.firstUsed = earlier(primary.firstUsed, order.date_created); primary.lastUsed = later(primary.lastUsed, order.date_created);
        month.primaryCouponUses++; month.primaryCouponRevenue += revenue; month.primaryCouponDiscount += discount;
        monthlyPrimaryCustomers[monthIndex]!.add(customer);
      }
    }
  }
  const finalize = (item: ReturnType<typeof emptyCoupon> & { customers: Set<string> }) => ({
    ...item, revenue: round(item.revenue), discount: round(item.discount), uniqueCustomers: item.customers.size,
    customers: undefined,
  });
  return {
    storeOrders: orders.length, storeRevenue: round(storeRevenue), couponOrders,
    emailAttributed: roundedMetric(emailAttributed), emailInfluenced: roundedMetric(emailInfluenced),
    primary: finalize(primary),
    months: months.map((month, index) => ({ ...month, storeRevenue: round(month.storeRevenue), emailRevenue: round(month.emailRevenue), influencedRevenue: round(month.influencedRevenue), couponDiscount: round(month.couponDiscount), primaryCouponRevenue: round(month.primaryCouponRevenue), primaryCouponDiscount: round(month.primaryCouponDiscount), primaryCouponCustomers: monthlyPrimaryCustomers[index]!.size })),
    coupons: [...coupons.values()].map(finalize).sort((a, b) => b.uses - a.uses || b.revenue - a.revenue),
    emailBreakdown: {
      sources: aggregateList(emailSources), mediums: aggregateList(emailMediums), campaigns: aggregateList(emailCampaigns, 30),
      landings: aggregateList(emailLandings, 30), devices: aggregateList(emailDevices), sourceMedium: aggregateList(emailSourceMedium, 30),
    },
    emailCoverage: Object.fromEntries(Object.entries(emailCoverage).map(([key, value]) => [key, percent(value, emailAttributed.orders)])),
  };
}

function emptyCoupon(code: string) { return { key: normalizeCoupon(code), code, uses: 0, revenue: 0, discount: 0, uniqueCustomers: 0, firstUsed: null as string | null, lastUsed: null as string | null }; }
function normalizeCoupon(value: string) { return value.trim().toLocaleLowerCase('es-AR').normalize('NFKC'); }
function uniqueCouponLines(lines: CouponLine[]) { const seen = new Set<string>(); return lines.filter((line) => { const key = normalizeCoupon(line.code || ''); if (!key || seen.has(key)) return false; seen.add(key); return true; }); }
function orderRevenue(order: AnalyticsOrder) { const refund = (order.refunds || []).reduce((sum, item) => sum + Math.abs(num(item.total)), 0); return order.status === 'refunded' ? 0 : round(num(order.total) - refund - num(order.total_tax) - num(order.shipping_total)); }
function isEmailDimensions(dimensions: ReturnType<typeof orderDimensions>) { return dimensions.channel === 'Email' || /emblue|email|e-mail|newsletter/i.test(`${dimensions.sourceRaw} ${dimensions.medium} ${dimensions.campaign}`); }
function roundedMetric(metric: { orders: number; revenue: number }) { return { ...metric, revenue: round(metric.revenue), averageTicket: metric.orders ? round(metric.revenue / metric.orders) : 0 }; }
function percent(value: number, total: number) { return total ? round(value / total * 100) : 0; }
function percentageDeltaValue(current: number, previous: number) { return previous ? round((current - previous) / previous * 100) : current ? null : 0; }
function compareMetric(current: { orders: number; revenue: number; averageTicket: number }, previous: { orders: number; revenue: number; averageTicket: number }, totals: { storeOrders: number; storeRevenue: number }) { return { ...current, orderShare: percent(current.orders, totals.storeOrders), revenueShare: percent(current.revenue, totals.storeRevenue), previous, delta: { orders: percentageDeltaValue(current.orders, previous.orders), revenue: percentageDeltaValue(current.revenue, previous.revenue), averageTicket: percentageDeltaValue(current.averageTicket, previous.averageTicket) } }; }
function compareCoupon(current: ReturnType<typeof emptyCoupon> & { uniqueCustomers?: number }, previous: ReturnType<typeof emptyCoupon> & { uniqueCustomers?: number }, storeOrders: number) { return { ...current, usageRate: percent(current.uses, storeOrders), previous: { uses: previous.uses, revenue: previous.revenue, discount: previous.discount }, delta: { uses: percentageDeltaValue(current.uses, previous.uses), revenue: percentageDeltaValue(current.revenue, previous.revenue), discount: percentageDeltaValue(current.discount, previous.discount) } }; }
function earlier(current: string | null, value?: string) { const date = value?.slice(0, 10) || null; return !current || (date && date < current) ? date : current; }
function later(current: string | null, value?: string) { const date = value?.slice(0, 10) || null; return !current || (date && date > current) ? date : current; }

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
