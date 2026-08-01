import express, { type NextFunction, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { config, credentialsConfigured } from './config.js';
import { WooError, getAll, publicApiIndex, wooGet } from './woocommerce.js';
import { capabilities, explorerResources } from './capabilities.js';
import { orderDimensions, summarizeOrders, type AnalyticsOrder } from './analytics.js';

const app = express();
const dashboardCache = new Map<string, { expires: number; value: unknown }>();
const orderRangeCache = new Map<string, { expires: number; value: Record<string, unknown>[] }>();
const salesReportCache = new Map<string, { expires: number; value: NativeSalesReport }>();
app.use(helmet());
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '100kb' }));

const listQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().max(100).optional(), status: z.string().max(50).optional(),
  after: z.string().datetime({ offset: true }).optional(), before: z.string().datetime({ offset: true }).optional(),
  orderby: z.enum(['date', 'id', 'title', 'include']).optional(), order: z.enum(['asc', 'desc']).optional(),
  product: z.coerce.number().int().positive().optional(), customer: z.coerce.number().int().min(0).optional(),
  sku: z.string().max(100).optional(), stock_status: z.enum(['instock', 'outofstock', 'onbackorder']).optional(),
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: credentialsConfigured(), storeUrl: config.storeUrl, mode: 'read-only' });
});

app.get('/api/capabilities', async (_req, res, next) => {
  try {
    const index = await publicApiIndex();
    const routes = Object.keys(index.routes || {});
    const probes = capabilities.filter((item) => item.probe);
    const access = new Map<string, { status: 'available' | 'forbidden' | 'error' | 'not-configured'; detail?: string }>();
    if (!credentialsConfigured()) probes.forEach((item) => access.set(item.id, { status: 'not-configured' }));
    else {
      await Promise.all(probes.map(async (item) => {
        try {
          await wooGet(item.path, { per_page: 1 });
          access.set(item.id, { status: 'available' });
        } catch (error) {
          const status = error instanceof WooError && [401, 403].includes(error.status) ? 'forbidden' : 'error';
          access.set(item.id, { status, detail: error instanceof Error ? error.message : 'Error desconocido' });
        }
      }));
    }
    const extensions = [
      { id: 'stock-notifier', title: 'Avisos de reposición', namespace: 'wc-instocknotifier/v3', description: 'Suscripciones de clientes a productos sin stock.' },
      { id: 'store-credits', title: 'Créditos de tienda', namespace: 'wc-store-credits/v1', description: 'Saldos y movimientos de créditos, según permisos del plugin.' },
      { id: 'pos', title: 'Punto de venta', namespace: 'wc/pos/v1', description: 'Catálogo preparado para operaciones POS.' },
      { id: 'facebook', title: 'Facebook for WooCommerce', namespace: 'wc-facebook/v1', description: 'Sincronización e integración con Meta.' },
      { id: 'google', title: 'Google Listings & Ads', namespace: 'wc/gla', description: 'Feed, estadísticas, Merchant Center y campañas.' },
      { id: 'analytics', title: 'WooCommerce Analytics', namespace: 'wc-analytics', description: 'Reportes analíticos internos del administrador.' },
    ].map((extension) => ({ ...extension, detected: (index.namespaces || []).includes(extension.namespace) }));
    res.json({
      store: config.storeUrl,
      namespaces: (index.namespaces || []).filter((name) => /^(wc|woocommerce)/.test(name)),
      capabilities: capabilities.map((item) => ({ ...item, access: access.get(item.id) || null, routeDetected: routes.some((route) => route.includes(`/wc/v3/${item.path.split('/{')[0]}`)) })),
      extensions,
    });
  } catch (error) { next(error); }
});

app.get('/api/dashboard', async (req, res, next) => {
  try {
    const range = z.object({
      from: z.string().date(), to: z.string().date(), statuses: z.string().optional(),
      compare_from: z.string().date().optional(), compare_to: z.string().date().optional(),
    }).parse(req.query);
    if (range.from > range.to) throw new WooError(400, 'La fecha desde no puede ser posterior a la fecha hasta');
    if (Boolean(range.compare_from) !== Boolean(range.compare_to)) throw new WooError(400, 'La comparación personalizada necesita fecha desde y hasta');
    if (range.compare_from && range.compare_to && range.compare_from > range.compare_to) throw new WooError(400, 'La comparación personalizada tiene las fechas invertidas');
    const statuses = parseStatuses(range.statuses);
    const cacheKey = `${range.from}:${range.to}:${statuses.join(',')}:${range.compare_from || ''}:${range.compare_to || ''}`;
    const cached = dashboardCache.get(cacheKey);
    if (cached && cached.expires > Date.now()) return res.json({ ...(cached.value as object), cached: true });
    const periods = comparisonPeriods(range.from, range.to);
    const customPeriod = range.compare_from && range.compare_to ? { from: range.compare_from, to: range.compare_to } : null;
    const [currentOrders, previousOrders, yearOrders, customOrders] = await Promise.all([
      loadOrdersPeriod(periods.current), loadOrdersPeriod(periods.previous), loadOrdersPeriod(periods.previousYear),
      customPeriod ? loadOrdersPeriod(customPeriod) : Promise.resolve(null),
    ]);
    let current = summarizeOrders(currentOrders as never[], statuses);
    let previous = summarizeOrders(previousOrders as never[], statuses);
    let previousYear = summarizeOrders(yearOrders as never[], statuses);
    let custom = customOrders ? summarizeOrders(customOrders as never[], statuses) : null;
    if (isWooReportPreset(statuses)) {
      const [currentReport, previousReport, yearReport, customReport] = await Promise.all([
        loadSalesReport(periods.current), loadSalesReport(periods.previous), loadSalesReport(periods.previousYear),
        customPeriod ? loadSalesReport(customPeriod) : Promise.resolve(null),
      ]);
      current = applyNativeReport(current, currentReport);
      previous = applyNativeReport(previous, previousReport);
      previousYear = applyNativeReport(previousYear, yearReport);
      if (custom && customReport) custom = applyNativeReport(custom, customReport);
    }
    const value = {
      ...current, selectedStatuses: statuses, periods: { ...periods, ...(customPeriod ? { custom: customPeriod } : {}) }, comparisons: {
        previous: comparisonSummary(previous, current),
        previousYear: comparisonSummary(previousYear, current),
        ...(custom ? { custom: comparisonSummary(custom, current) } : {}),
      },
      generatedAt: new Date().toISOString(), cached: false,
    };
    dashboardCache.set(cacheKey, { expires: Date.now() + 5 * 60_000, value });
    res.json(value);
  } catch (error) { next(error); }
});

app.get('/api/attribution/orders', async (req, res, next) => {
  try {
    const query = z.object({
      from: z.string().date(), to: z.string().date(),
      dimension: z.enum(['channel', 'source', 'campaign', 'device', 'landing', 'province', 'city']),
      value: z.string().min(1).max(300), statuses: z.string().optional(),
    }).parse(req.query);
    const selectedStatuses = new Set(parseStatuses(query.statuses));
    const orders = await loadOrdersPeriod({ from: query.from, to: query.to });
    const data = (orders as AnalyticsOrder[]).filter((order) => {
      if (!selectedStatuses.has(order.status || '')) return false;
      return orderDimensions(order)[query.dimension] === query.value;
    }).map((order) => {
      const dimensions = orderDimensions(order);
      const refunds = (order.refunds || []).reduce((sum, refund) => sum + Math.abs(Number(refund.total || 0)), 0);
      const billing = order.billing as AnalyticsOrder['billing'] & { first_name?: string; last_name?: string };
      return {
        id: order.id, number: order.number, date_created: order.date_created, status: order.status,
        total: Number(order.total || 0) - refunds,
        customer: `${billing?.first_name || ''} ${billing?.last_name || ''}`.trim() || 'Invitado',
        source: dimensions.source, channel: dimensions.channel, campaign: dimensions.campaign,
        city: dimensions.city, province: dimensions.province,
      };
    });
    res.json({ total: data.length, data: data.slice(0, 250) });
  } catch (error) { next(error); }
});

async function loadOrdersPeriod({ from, to }: { from: string; to: string }) {
  const key = `${from}:${to}`; const cached = orderRangeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const value = await getAll<Record<string, unknown>>('orders', {
    after: `${from}T00:00:00-03:00`, before: `${to}T23:59:59-03:00`, orderby: 'date', order: 'desc', status: 'any',
  });
  orderRangeCache.set(key, { expires: Date.now() + 5 * 60_000, value });
  return value;
}

type NativeSalesReport = {
  total_sales?: string; net_sales?: string; total_orders?: number; total_tax?: string; total_shipping?: string;
  total_refunds?: number; total_discount?: string; totals?: Record<string, { sales?: string; tax?: string; shipping?: string }>;
};
async function loadSalesReport({ from, to }: { from: string; to: string }) {
  const key = `${from}:${to}`; const cached = salesReportCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const response = await wooGet<NativeSalesReport[]>('reports/sales', { date_min: from, date_max: to });
  const value = response.data[0] || {};
  salesReportCache.set(key, { expires: Date.now() + 5 * 60_000, value });
  return value;
}

function isWooReportPreset(statuses: string[]) {
  return statuses.length === 3 && ['processing', 'completed', 'refunded'].every((status) => statuses.includes(status));
}

function applyNativeReport<T extends ReturnType<typeof summarizeOrders>>(summary: T, report: NativeSalesReport): T {
  const gross = Number(report.total_sales || 0); const net = Number(report.net_sales || 0); const refunds = Number(report.total_refunds || 0);
  return {
    ...summary, orders: Number(report.total_orders || 0), validOrders: Number(report.total_orders || 0),
    revenue: net, averageTicket: report.total_orders ? net / report.total_orders : 0,
    financials: {
      ...summary.financials, chargedTotal: gross + refunds, refunds, netCollected: gross,
      wooGrossSales: gross, wooNetSales: net, taxesTotal: Number(report.total_tax || 0),
      shippingExTax: Number(report.total_shipping || 0), discountsExTax: Number(report.total_discount || 0),
    },
    byDay: Object.entries(report.totals || {}).sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => ({
      date, total: Math.round((Number(values.sales || 0) - Number(values.tax || 0) - Number(values.shipping || 0)) * 100) / 100,
    })),
  };
}

function comparisonPeriods(from: string, to: string) {
  const start = dateOnly(from); const end = dateOnly(to);
  const previousFrom = shiftMonth(start, -1); const previousTo = shiftMonth(end, -1);
  const yearFrom = new Date(start); yearFrom.setUTCFullYear(yearFrom.getUTCFullYear() - 1);
  const yearTo = new Date(end); yearTo.setUTCFullYear(yearTo.getUTCFullYear() - 1);
  return {
    current: { from, to },
    previous: { from: isoDay(previousFrom), to: isoDay(previousTo) },
    previousYear: { from: isoDay(yearFrom), to: isoDay(yearTo) },
  };
}

const allowedStatuses = new Set(['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed']);
function parseStatuses(value?: string) {
  const statuses = (value || 'processing,completed,refunded').split(',').map((item) => item.trim()).filter((item) => allowedStatuses.has(item));
  if (!statuses.length) throw new WooError(400, 'Seleccioná al menos un estado de pedido');
  return [...new Set(statuses)];
}

function comparisonSummary(period: ReturnType<typeof summarizeOrders>, current: ReturnType<typeof summarizeOrders>) {
  return {
    revenue: period.revenue, orders: period.orders, validOrders: period.validOrders,
    averageTicket: period.averageTicket, uniqueCustomers: period.uniqueCustomers, byDay: period.byDay,
    delta: {
      revenue: percentageDelta(current.revenue, period.revenue),
      orders: percentageDelta(current.orders, period.orders),
      averageTicket: percentageDelta(current.averageTicket, period.averageTicket),
      uniqueCustomers: percentageDelta(current.uniqueCustomers, period.uniqueCustomers),
    },
  };
}

function percentageDelta(current: number, baseline: number) {
  if (!baseline) return current ? null : 0;
  return Math.round(((current - baseline) / baseline) * 1000) / 10;
}
function dateOnly(value: string) { return new Date(`${value}T12:00:00Z`); }
function shiftMonth(value: Date, amount: number) { const result = new Date(value); const day = result.getUTCDate(); result.setUTCDate(1); result.setUTCMonth(result.getUTCMonth() + amount); const maxDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0, 12)).getUTCDate(); result.setUTCDate(Math.min(day, maxDay)); return result; }
function isoDay(value: Date) { return value.toISOString().slice(0, 10); }

app.get('/api/orders', async (req, res, next) => {
  try {
    const query = listQuery.parse(req.query);
    const result = await wooGet<unknown[]>('orders', { ...query, status: query.status || 'any' });
    res.json({
      ...result,
      data: (result.data as AnalyticsOrder[]).map((order) => ({ ...order, _attribution: orderDimensions(order) })),
    });
  } catch (error) { next(error); }
});

app.get('/api/orders/:id', async (req, res, next) => {
  try {
    const id = z.coerce.number().int().positive().parse(req.params.id);
    const order = await wooGet<Record<string, unknown>>(`orders/${id}`);
    const safeExtra = async (path: string) => {
      try { return (await wooGet<unknown[]>(path, { per_page: 100 })).data; } catch { return []; }
    };
    const [notes, refunds] = await Promise.all([safeExtra(`orders/${id}/notes`), safeExtra(`orders/${id}/refunds`)]);
    res.json({ ...order.data, _attribution: orderDimensions(order.data as AnalyticsOrder), _related: { notes, refunds } });
  } catch (error) { next(error); }
});

app.get('/api/explorer/:resource', async (req, res, next) => {
  try {
    const resource = z.string().parse(req.params.resource);
    const basePath = explorerResources[resource];
    if (!basePath) throw new WooError(400, 'Recurso no permitido en el explorador de solo lectura');
    const id = req.query.id ? z.coerce.number().int().positive().parse(req.query.id) : null;
    const query = listQuery.partial().parse(Object.fromEntries(Object.entries(req.query).filter(([key]) => key !== 'id')));
    const path = id && ['orders', 'products', 'customers', 'coupons'].includes(resource) ? `${basePath}/${id}` : basePath;
    const result = await wooGet<unknown>(path, id ? {} : { per_page: 25, page: 1, ...query });
    res.json(result);
  } catch (error) { next(error); }
});

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Parámetros inválidos', details: error.issues });
  if (error instanceof WooError) return res.status(error.status).json({ error: error.message, details: error.details });
  console.error(error);
  return res.status(500).json({ error: error instanceof Error ? error.message : 'Error interno' });
});

app.listen(config.port, () => {
  console.log(`Servidor Zafrán listo en el puerto ${config.port}.`);
  console.log(credentialsConfigured() ? 'Credenciales configuradas.' : 'Esperando credenciales en server/.env');
});
