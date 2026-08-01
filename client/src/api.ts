export async function api<T>(path: string): Promise<T> {
  window.dispatchEvent(new CustomEvent('api-loading', { detail: 1 }));
  try {
    const response = await fetch(`/api${path}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Error ${response.status}`);
    return data as T;
  } finally {
    window.dispatchEvent(new CustomEvent('api-loading', { detail: -1 }));
  }
}

export function money(value: number | string = 0) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(value));
}

export function shortDate(value?: string) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}
