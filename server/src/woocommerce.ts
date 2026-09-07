import { config, credentialsConfigured } from './config.js';

export class WooError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export type WooResponse<T> = { data: T; total: number | null; totalPages: number | null };

let activeRequests = 0;
const waiting: Array<() => void> = [];
async function acquire() {
  if (activeRequests < 5) { activeRequests++; return; }
  await new Promise<void>((resolve) => waiting.push(resolve));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else activeRequests--;
}

export async function wooGet<T>(path: string, params: Record<string, unknown> = {}): Promise<WooResponse<T>> {
  if (!credentialsConfigured()) throw new WooError(503, 'Faltan las credenciales de WooCommerce en server/.env');
  const url = new URL(`${config.storeUrl}/wp-json/wc/v3/${path.replace(/^\//, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const auth = Buffer.from(`${config.key}:${config.secret}`).toString('base64');
  await acquire();
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(30_000), headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const body = payload as { message?: string; code?: string } | null;
      throw new WooError(response.status, body?.message || `WooCommerce respondió ${response.status}`, body);
    }
    return {
      data: payload as T,
      total: numberHeader(response.headers.get('x-wp-total')),
      totalPages: numberHeader(response.headers.get('x-wp-totalpages')),
    };
  } finally { release(); }
}

function numberHeader(value: string | null) {
  return value === null ? null : Number(value);
}

export async function getAll<T>(path: string, params: Record<string, unknown> = {}, maxPages = Number.POSITIVE_INFINITY) {
  const first = await wooGet<T[]>(path, { ...params, per_page: 100, page: 1 });
  const pageCount = first.totalPages || 1;
  if (pageCount > maxPages) throw new WooError(502, 'El rango supera el límite de páginas; acortá las fechas para obtener un informe completo');
  if (pageCount <= 1) return first.data;
  const remaining: T[][] = [];
  const pages = Array.from({ length: pageCount - 1 }, (_, index) => index + 2);
  for (let index = 0; index < pages.length; index += 5) {
    const batch = await Promise.all(pages.slice(index, index + 5).map((page) =>
      wooGet<T[]>(path, { ...params, per_page: 100, page }),
    ));
    remaining.push(...batch.map((response) => response.data));
  }
  return [first.data, ...remaining].flat();
}

export async function publicApiIndex() {
  const response = await fetch(`${config.storeUrl}/wp-json/`);
  if (!response.ok) throw new WooError(response.status, 'No se pudo leer el índice público de WordPress');
  return response.json() as Promise<{ namespaces?: string[]; routes?: Record<string, unknown> }>;
}
