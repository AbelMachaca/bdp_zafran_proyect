type Period = { from: string; to: string };
type DatedOrder = { date_created?: unknown };

// Share complete ranges across reports, including concurrent requests.
export function createOrderCache<T extends DatedOrder>(fetchOrders: (period: Period) => Promise<T[]>, ttl = 60_000) {
  const entries = new Map<string, { period: Period; expires: number; value: T[] }>();
  const pending = new Map<string, { period: Period; promise: Promise<T[]> }>();
  const contains = (outer: Period, inner: Period) => outer.from <= inner.from && outer.to >= inner.to;
  const select = (orders: T[], period: Period) => orders.filter((order) => {
    const date = String(order.date_created || '').slice(0, 10);
    return date >= period.from && date <= period.to;
  });
  return async (period: Period, refresh = false): Promise<T[]> => {
    const key = `${period.from}:${period.to}`;
    for (const [entryKey, entry] of entries) if (entry.expires <= Date.now()) entries.delete(entryKey);
    // A manual refresh also joins an in-flight fresh fetch.
    for (const entry of pending.values()) if (contains(entry.period, period)) return select(await entry.promise, period);
    if (!refresh) for (const entry of entries.values()) if (contains(entry.period, period)) return select(entry.value, period);
    if (refresh) {
      // Invalidate overlapping ranges so another report cannot reuse older orders.
      for (const [entryKey, entry] of entries) if (entry.period.from <= period.to && entry.period.to >= period.from) entries.delete(entryKey);
    }
    const promise = fetchOrders(period);
    pending.set(key, { period, promise });
    try {
      const value = await promise;
      if (entries.size >= 24) entries.delete(entries.keys().next().value!);
      entries.set(key, { period, expires: Date.now() + ttl, value });
      return select(value, period);
    } finally { pending.delete(key); }
  };
}
