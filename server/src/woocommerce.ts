import { config, credentialsConfigured } from './config.js';

export class WooError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export type WooResponse<T> = { data: T; total: number | null; totalPages: number | null };

export async function wooGet<T>(path: string, params: Record<string, unknown> = {}): Promise<WooResponse<T>> {
  if (!credentialsConfigured()) throw new WooError(503, 'Faltan las credenciales de WooCommerce en server/.env');
  const url = new URL(`${config.storeUrl}/wp-json/wc/v3/${path.replace(/^\//, '')}`);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const auth = Buffer.from(`${config.key}:${config.secret}`).toString('base64');
  const response = await fetch(url, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json' } });
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
}

function numberHeader(value: string | null) {
  return value === null ? null : Number(value);
}

export async function getAll<T>(path: string, params: Record<string, unknown> = {}, maxPages = 50) {
  const first = await wooGet<T[]>(path, { ...params, per_page: 100, page: 1 });
  const pageCount = Math.min(first.totalPages || 1, maxPages);
  if (pageCount <= 1) return first.data;
  const remaining = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => wooGet<T[]>(path, { ...params, per_page: 100, page: index + 2 })),
  );
  return [first.data, ...remaining.map((page) => page.data)].flat();
}

export async function publicApiIndex() {
  const response = await fetch(`${config.storeUrl}/wp-json/`);
  if (!response.ok) throw new WooError(response.status, 'No se pudo leer el índice público de WordPress');
  return response.json() as Promise<{ namespaces?: string[]; routes?: Record<string, unknown> }>;
}
